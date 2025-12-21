package main

import (
	"bufio"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"net/mail"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/websocket/v2"
	"github.com/emersion/go-imap"
	"github.com/emersion/go-imap/client"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type EmailAccount struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	Email     string    `json:"email" gorm:"uniqueIndex"`
	Password  string    `json:"password"`
	Host      string    `json:"host"`
	Port      int       `json:"port"`
	Protocol  string    `json:"protocol"`
	IsActive  bool      `json:"isActive" gorm:"default:true"`
	LastCheck time.Time `json:"lastCheck"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type EmailNotification struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	AccountEmail string    `json:"accountEmail"`
	From         string    `json:"from"`
	Subject      string    `json:"subject"`
	MessageID    string    `json:"messageId" gorm:"uniqueIndex"`
	ReceivedAt   time.Time `json:"receivedAt"`
	CreatedAt    time.Time `json:"createdAt"`
}

type WSMessage struct {
	Type    string              `json:"type"`
	Payload json.RawMessage     `json:"payload,omitempty"`
	Notif   *EmailNotification  `json:"notification,omitempty"`
}

var (
	db            *gorm.DB
	wsClients     = make(map[*websocket.Conn]bool)
	wsClientsMux  sync.RWMutex
	checkInterval time.Duration
)

func main() {
	// Load environment variables
	dbHost := getEnv("DB_HOST", "localhost")
	dbPort := getEnv("DB_PORT", "5432")
	dbUser := getEnv("DB_USER", "postgres")
	dbPassword := getEnv("DB_PASSWORD", "root")
	dbName := getEnv("DB_NAME", "postgres")
	serverPort := getEnv("SERVER_PORT", "8081")
	checkIntervalStr := getEnv("CHECK_INTERVAL", "10")
	
	checkIntervalInt, err := strconv.Atoi(checkIntervalStr)
	if err != nil {
		checkIntervalInt = 10
	}
	checkInterval = time.Duration(checkIntervalInt) * time.Second

	// Connect to database
	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		dbHost, dbPort, dbUser, dbPassword, dbName)
	db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	db.AutoMigrate(&EmailAccount{}, &EmailNotification{})

	app := fiber.New(fiber.Config{
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	})
	
	app.Use(cors.New(cors.Config{
		AllowOrigins: getEnv("CORS_ORIGINS", "*"),
		AllowHeaders: "Origin, Content-Type, Accept",
	}))

	// REST API endpoints
	app.Get("/api/accounts", getAccounts)
	app.Post("/api/accounts", createAccount)
	app.Put("/api/accounts/:id", updateAccount)
	app.Delete("/api/accounts/:id", deleteAccount)
	app.Get("/api/notifications", getNotifications)

	// WebSocket endpoint
	app.Use("/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			c.Locals("allowed", true)
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})
	
	app.Get("/ws", websocket.New(func(c *websocket.Conn) {
		wsClientsMux.Lock()
		wsClients[c] = true
		wsClientsMux.Unlock()

		defer func() {
			wsClientsMux.Lock()
			delete(wsClients, c)
			wsClientsMux.Unlock()
			c.Close()
		}()

		// Send initial data
		sendInitialData(c)

		// Keep connection alive and handle incoming messages
		for {
			_, _, err := c.ReadMessage()
			if err != nil {
				log.Println("WebSocket read error:", err)
				break
			}
		}
	}))

	// Start email check worker
	go emailCheckWorker()

	log.Printf("Server starting on :%s", serverPort)
	log.Fatal(app.Listen(":" + serverPort))
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func sendInitialData(c *websocket.Conn) {
	var accounts []EmailAccount
	db.Find(&accounts)
	
	accountsJSON, _ := json.Marshal(accounts)
	c.WriteJSON(WSMessage{
		Type:    "accounts",
		Payload: accountsJSON,
	})

	var notifications []EmailNotification
	db.Order("received_at DESC").Limit(50).Find(&notifications)
	
	notifsJSON, _ := json.Marshal(notifications)
	c.WriteJSON(WSMessage{
		Type:    "notifications",
		Payload: notifsJSON,
	})
}

func broadcastToClients(msg WSMessage) {
	wsClientsMux.RLock()
	defer wsClientsMux.RUnlock()

	for client := range wsClients {
		if err := client.WriteJSON(msg); err != nil {
			log.Printf("WebSocket write error: %v", err)
		}
	}
}

func getAccounts(c *fiber.Ctx) error {
	var accounts []EmailAccount
	db.Find(&accounts)
	return c.JSON(accounts)
}

func createAccount(c *fiber.Ctx) error {
	account := new(EmailAccount)
	if err := c.BodyParser(account); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	
	if err := db.Create(account).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Broadcast update via WebSocket
	var accounts []EmailAccount
	db.Find(&accounts)
	accountsJSON, _ := json.Marshal(accounts)
	broadcastToClients(WSMessage{
		Type:    "accounts",
		Payload: accountsJSON,
	})

	return c.JSON(account)
}

func updateAccount(c *fiber.Ctx) error {
	id := c.Params("id")
	account := new(EmailAccount)
	
	if err := db.First(account, id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Account not found"})
	}
	
	if err := c.BodyParser(account); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	
	if err := db.Save(account).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Broadcast update via WebSocket
	var accounts []EmailAccount
	db.Find(&accounts)
	accountsJSON, _ := json.Marshal(accounts)
	broadcastToClients(WSMessage{
		Type:    "accounts",
		Payload: accountsJSON,
	})

	return c.JSON(account)
}

func deleteAccount(c *fiber.Ctx) error {
	id := c.Params("id")
	
	if err := db.Delete(&EmailAccount{}, id).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Broadcast update via WebSocket
	var accounts []EmailAccount
	db.Find(&accounts)
	accountsJSON, _ := json.Marshal(accounts)
	broadcastToClients(WSMessage{
		Type:    "accounts",
		Payload: accountsJSON,
	})

	return c.JSON(fiber.Map{"success": true})
}

func getNotifications(c *fiber.Ctx) error {
	var notifications []EmailNotification
	limit := c.QueryInt("limit", 50)
	
	db.Order("received_at DESC").Limit(limit).Find(&notifications)
	return c.JSON(notifications)
}

func emailCheckWorker() {
	ticker := time.NewTicker(checkInterval)
	defer ticker.Stop()

	for range ticker.C {
		var accounts []EmailAccount
		db.Where("is_active = ?", true).Find(&accounts)

		for _, account := range accounts {
			go checkEmail(account)
		}
	}
}

func checkEmail(account EmailAccount) {
	log.Printf("Checking email for %s", account.Email)

	if account.Protocol == "IMAP" {
		checkIMAP(account)
	} else if account.Protocol == "POP3" {
		checkPOP3(account)
	}

	account.LastCheck = time.Now()
	db.Save(&account)
}

func checkIMAP(account EmailAccount) {
	c, err := client.DialTLS(fmt.Sprintf("%s:%d", account.Host, account.Port), &tls.Config{
		InsecureSkipVerify: true,
	})
	if err != nil {
		log.Printf("Failed to connect to IMAP server for %s: %v", account.Email, err)
		return
	}
	defer c.Logout()

	if err := c.Login(account.Email, account.Password); err != nil {
		log.Printf("Failed to login for %s: %v", account.Email, err)
		return
	}

	mbox, err := c.Select("INBOX", false)
	if err != nil {
		log.Printf("Failed to select INBOX for %s: %v", account.Email, err)
		return
	}

	if mbox.Messages == 0 {
		return
	}

	from := uint32(1)
	to := mbox.Messages
	if mbox.Messages > 10 {
		from = mbox.Messages - 9
	}

	seqset := new(imap.SeqSet)
	seqset.AddRange(from, to)

	messages := make(chan *imap.Message, 10)
	done := make(chan error, 1)
	go func() {
		done <- c.Fetch(seqset, []imap.FetchItem{imap.FetchEnvelope, imap.FetchUid}, messages)
	}()

	for msg := range messages {
		if msg.Envelope == nil {
			continue
		}

		fromAddr := ""
		if len(msg.Envelope.From) > 0 {
			addr := msg.Envelope.From[0]
			fromAddr = fmt.Sprintf("%s@%s", addr.MailboxName, addr.HostName)
			if addr.PersonalName != "" {
				fromAddr = fmt.Sprintf("%s <%s>", addr.PersonalName, fromAddr)
			}
		}

		subject := msg.Envelope.Subject
		messageID := msg.Envelope.MessageId
		receivedAt := msg.Envelope.Date

		var existing EmailNotification
		result := db.Where("message_id = ?", messageID).First(&existing)
		
		if result.Error == gorm.ErrRecordNotFound {
			notification := EmailNotification{
				AccountEmail: account.Email,
				From:         fromAddr,
				Subject:      subject,
				MessageID:    messageID,
				ReceivedAt:   receivedAt,
			}
			
			if err := db.Create(&notification).Error; err != nil {
				log.Printf("Failed to save notification: %v", err)
			} else {
				log.Printf("New email: %s - %s", fromAddr, subject)
				// Broadcast new notification via WebSocket
				broadcastToClients(WSMessage{
					Type:  "new_notification",
					Notif: &notification,
				})
			}
		}
	}

	if err := <-done; err != nil {
		log.Printf("Fetch error for %s: %v", account.Email, err)
	}
}

func checkPOP3(account EmailAccount) {
	conn, err := tls.Dial("tcp", fmt.Sprintf("%s:%d", account.Host, account.Port), 
		&tls.Config{InsecureSkipVerify: true})
	if err != nil {
		log.Printf("Failed to connect to POP3 server for %s: %v", account.Email, err)
		return
	}
	defer conn.Close()

	reader := bufio.NewReader(conn)
	
	_, err = reader.ReadString('\n')
	if err != nil {
		log.Printf("Failed to read welcome for %s: %v", account.Email, err)
		return
	}

	fmt.Fprintf(conn, "USER %s\r\n", account.Email)
	response, _ := reader.ReadString('\n')
	if !strings.HasPrefix(response, "+OK") {
		log.Printf("POP3 USER failed for %s: %s", account.Email, response)
		return
	}

	fmt.Fprintf(conn, "PASS %s\r\n", account.Password)
	response, _ = reader.ReadString('\n')
	if !strings.HasPrefix(response, "+OK") {
		log.Printf("POP3 PASS failed for %s: %s", account.Email, response)
		return
	}

	fmt.Fprintf(conn, "STAT\r\n")
	response, _ = reader.ReadString('\n')
	if !strings.HasPrefix(response, "+OK") {
		log.Printf("POP3 STAT failed for %s: %s", account.Email, response)
		return
	}

	parts := strings.Fields(response)
	if len(parts) < 2 {
		return
	}
	
	count, err := strconv.Atoi(parts[1])
	if err != nil || count == 0 {
		return
	}

	start := 1
	if count > 10 {
		start = count - 9
	}

	for i := start; i <= count; i++ {
		fmt.Fprintf(conn, "TOP %d 0\r\n", i)
		response, _ = reader.ReadString('\n')
		if !strings.HasPrefix(response, "+OK") {
			continue
		}

		var headers strings.Builder
		for {
			line, err := reader.ReadString('\n')
			if err != nil || line == ".\r\n" || line == ".\n" {
				break
			}
			headers.WriteString(line)
		}

		emailMsg, err := mail.ReadMessage(strings.NewReader(headers.String()))
		if err != nil {
			log.Printf("Failed to parse message %d for %s: %v", i, account.Email, err)
			continue
		}

		subject := emailMsg.Header.Get("Subject")
		from := emailMsg.Header.Get("From")
		messageID := emailMsg.Header.Get("Message-ID")
		dateStr := emailMsg.Header.Get("Date")

		if messageID == "" {
			messageID = fmt.Sprintf("pop3-%s-%d-%d", account.Email, i, time.Now().Unix())
		}

		receivedAt := time.Now()
		if dateStr != "" {
			if parsedDate, err := mail.ParseDate(dateStr); err == nil {
				receivedAt = parsedDate
			}
		}

		var existing EmailNotification
		result := db.Where("message_id = ?", messageID).First(&existing)
		
		if result.Error == gorm.ErrRecordNotFound {
			notification := EmailNotification{
				AccountEmail: account.Email,
				From:         from,
				Subject:      subject,
				MessageID:    messageID,
				ReceivedAt:   receivedAt,
			}
			
			if err := db.Create(&notification).Error; err != nil {
				log.Printf("Failed to save notification: %v", err)
			} else {
				log.Printf("New email: %s - %s", from, subject)
				// Broadcast new notification via WebSocket
				broadcastToClients(WSMessage{
					Type:  "new_notification",
					Notif: &notification,
				})
			}
		}
	}

	fmt.Fprintf(conn, "QUIT\r\n")
}