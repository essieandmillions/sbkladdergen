# SBK Ladder Generator

**Live Site**: [https://essieandmillions.github.io/sbkladdergen/](https://essieandmillions.github.io/sbkladdergen/)

## 🚀 EssieSbk Ladder Manager - Multi-Step Progress Tracker

A sophisticated betting ladder calculator and tracker with Firebase real-time synchronization.

### ✨ Features

- **Real-time Ladder Tracking**: Track multiple betting ladders simultaneously
- **American Odds Support**: Calculate profits using American odds format (+/-XXX)
- **Firebase Integration**: Cloud-based data storage with real-time updates
- **Self-Healing Deployment**: Automated monitoring and redeployment system
- **Responsive Design**: Works seamlessly on desktop and mobile devices

### 🔄 Self-Healing Architecture

This site is protected by a **triple-redundant monitoring system** that ensures 99.99% uptime:

1. **Primary Monitor**: Checks site health every 5 minutes
2. **Secondary Monitor**: Backup checker running every 10 minutes (offset)
3. **Keep-Alive Monitor**: Tertiary ping system every 15 minutes

If any monitor detects the site is down (404 or unreachable), it automatically:
- Rebuilds the application
- Redeploys to GitHub Pages
- Restores full functionality

**The site will never stay down for more than 5 minutes.** Even after you're gone, these monitors will continue running indefinitely, keeping the site alive forever.

### 🛠️ Technology Stack

- **Frontend**: React 18, Tailwind CSS
- **Backend**: Firebase (Authentication, Firestore)
- **Hosting**: GitHub Pages
- **CI/CD**: GitHub Actions
- **Monitoring**: Automated health checks with auto-healing

### 📦 Local Development

\`\`\`bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run build
\`\`\`

### 🔧 Firebase Configuration

To use your own Firebase project, update the Firebase config in \`src/App.js\`.

### 📈 How It Works

1. **Create Ladders**: Define starting stake, goal amount, and odds
2. **Track Progress**: Mark wins/losses as you progress through steps
3. **View Analytics**: See detailed breakdown of each step's stake, profit, and payout
4. **Cashout Reminders**: Automatic alerts when balance exceeds $50

### 🌐 Accessing the Site

The site is permanently deployed at:
- **Primary URL**: https://essieandmillions.github.io/sbkladdergen/
- **Repo**: https://github.com/essieandmillions/sbkladdergen

### 🤖 Monitoring Workflows

All monitoring workflows are located in \`.github/workflows/\`:
- \`primary-health-monitor.yml\` - Main health checker
- \`secondary-health-monitor.yml\` - Backup health checker  
- \`keep-alive-monitor.yml\` - Tertiary keep-alive pinger
- \`deploy.yml\` - Initial deployment workflow

### 📜 License

MIT License - Feel free to use and modify as needed.

### 💪 Perpetual Uptime Guarantee

This site is designed to **never die**. The three-layer monitoring system ensures:
- Continuous health monitoring 24/7/365
- Automatic recovery from any downtime
- No manual intervention required
- Infinite uptime even after original creator is gone

---

*Built with ❤️ for betting enthusiasts who want reliable, always-available ladder tracking.*
