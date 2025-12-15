package main

import (
	"bufio"
	"crypto/tls"
	"fmt"
	"log"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
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

var db *gorm.DB

func main() {
	var err error
	dsn := "host=localhost port=5432 user=postgres password=root dbname=postgres sslmode=disable"
	db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	db.AutoMigrate(&EmailAccount{}, &EmailNotification{})

	app := fiber.New()
	
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept",
	}))

	app.Get("/api/accounts", getAccounts)
	app.Post("/api/accounts", createAccount)
	app.Put("/api/accounts/:id", updateAccount)
	app.Delete("/api/accounts/:id", deleteAccount)
	app.Get("/api/notifications", getNotifications)

	go emailCheckWorker()

	log.Println("Server starting on :8081")
	log.Fatal(app.Listen(":8081"))
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
	
	db.Create(account)
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
	
	db.Save(account)
	return c.JSON(account)
}

func deleteAccount(c *fiber.Ctx) error {
	id := c.Params("id")
	db.Delete(&EmailAccount{}, id)
	return c.JSON(fiber.Map{"success": true})
}

func getNotifications(c *fiber.Ctx) error {
	var notifications []EmailNotification
	limit := c.QueryInt("limit", 50)
	
	db.Order("received_at DESC").Limit(limit).Find(&notifications)
	return c.JSON(notifications)
}

func emailCheckWorker() {
	ticker := time.NewTicker(10 * time.Second)
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
			}
		}
	}

	if err := <-done; err != nil {
		log.Printf("Fetch error for %s: %v", account.Email, err)
	}
}

func parseAddress(addr string) string {
	address, err := mail.ParseAddress(addr)
	if err != nil {
		return strings.TrimSpace(addr)
	}
	return address.String()
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
	
	// Read welcome message
	_, err = reader.ReadString('\n')
	if err != nil {
		log.Printf("Failed to read welcome for %s: %v", account.Email, err)
		return
	}

	// USER command
	fmt.Fprintf(conn, "USER %s\r\n", account.Email)
	response, _ := reader.ReadString('\n')
	if !strings.HasPrefix(response, "+OK") {
		log.Printf("POP3 USER failed for %s: %s", account.Email, response)
		return
	}

	// PASS command
	fmt.Fprintf(conn, "PASS %s\r\n", account.Password)
	response, _ = reader.ReadString('\n')
	if !strings.HasPrefix(response, "+OK") {
		log.Printf("POP3 PASS failed for %s: %s", account.Email, response)
		return
	}

	// STAT command
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

	// Check last 10 messages or all if less than 10
	start := 1
	if count > 10 {
		start = count - 9
	}

	for i := start; i <= count; i++ {
		// TOP command to get headers only
		fmt.Fprintf(conn, "TOP %d 0\r\n", i)
		response, _ = reader.ReadString('\n')
		if !strings.HasPrefix(response, "+OK") {
			continue
		}

		// Read message headers until "."
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
			}
		}
	}

	// QUIT command
	fmt.Fprintf(conn, "QUIT\r\n")
}