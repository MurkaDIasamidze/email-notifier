# Email Notification System

A full-stack application that monitors multiple email accounts and sends desktop notifications for new emails.

## Features

- Monitor multiple email accounts (IMAP/POP3)
- Real-time desktop notifications
- Shows email subject, sender, and recipient account
- Toggle accounts on/off
- Modern React UI with TypeScript
- Go backend with Fiber and GORM

## Prerequisites

- Go 1.21 or higher
- Node.js 18+ and npm
- PostgreSQL 13+
- Email accounts with IMAP/POP3 access

## Database Setup

1. Install PostgreSQL if not already installed
2. Create database and user:

```sql
CREATE DATABASE emailnotifier;
CREATE USER postgres WITH PASSWORD 'postgres';
GRANT ALL PRIVILEGES ON DATABASE emailnotifier TO postgres;
```

3. Update database credentials in `main.go` if needed:
```go
dsn := "host=localhost user=postgres password=postgres dbname=emailnotifier port=5432 sslmode=disable"
```

## Backend Setup

1. Navigate to backend directory:
```bash
mkdir email-notifier-backend
cd email-notifier-backend
```

2. Copy `main.go` and `go.mod` files

3. Install dependencies:
```bash
go mod download
```

4. Run the backend:
```bash
go run main.go
```

The backend will start on `http://localhost:8080`

## Frontend Setup

1. Create a new React + TypeScript project:
```bash
npm create vite@latest email-notifier-frontend -- --template react-ts
cd email-notifier-frontend
```

2. Install dependencies:
```bash
npm install lucide-react
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

3. Configure Tailwind CSS in `tailwind.config.js`:
```js
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

4. Update `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

5. Replace `src/App.tsx` with the React component from the artifact

6. Start the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

## Email Provider Configuration

### Gmail
- Host: `imap.gmail.com`
- Port: `993`
- Protocol: `IMAP`
- **Important**: Enable "App Passwords" in Google Account settings
- Use the app password instead of your regular password

### Outlook/Hotmail
- Host: `outlook.office365.com`
- Port: `993`
- Protocol: `IMAP`

### Yahoo Mail
- Host: `imap.mail.yahoo.com`
- Port: `993`
- Protocol: `IMAP`

### Other Providers
Check your email provider's IMAP/POP3 settings documentation.

## Usage

1. Click "Add Account" button
2. Enter email credentials:
   - Email address
   - Password (or app password)
   - IMAP/POP3 host
   - Port number
   - Protocol (IMAP or POP3)
3. Click "Add" to save
4. The system will check for new emails every 30 seconds
5. Desktop notifications will appear for new emails

## Desktop Notifications

- Click "Allow" when prompted for notification permissions
- Notifications show:
  - Email subject
  - Sender address
  - Recipient account

## API Endpoints

- `GET /api/accounts` - List all email accounts
- `POST /api/accounts` - Add new email account
- `PUT /api/accounts/:id` - Update account
- `DELETE /api/accounts/:id` - Delete account
- `GET /api/notifications?limit=50` - Get recent notifications

## Troubleshooting

### Desktop notifications not working
- Check browser notification permissions
- Ensure HTTPS or localhost (notifications require secure context)

### Email login fails
- Verify credentials are correct
- Enable IMAP/POP3 access in email provider settings
- Use app-specific passwords for Gmail
- Check firewall settings

### Database connection errors
- Ensure PostgreSQL is running
- Verify database credentials
- Check database exists

## Security Notes

- Passwords are stored in the database (consider encryption for production)
- Use app-specific passwords when available
- Consider using environment variables for database credentials
- Enable SSL/TLS for production deployments

## Development

Backend runs on port 8080, frontend on 5173. CORS is enabled for development.

For production:
- Build frontend: `npm run build`
- Serve frontend static files through Go backend
- Use proper password encryption
- Configure proper CORS settings
- Use environment variables for sensitive data