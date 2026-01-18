# Big Ten Men's Basketball Standings

A real-time, auto-updating display board for Big Ten Conference men's basketball standings. Designed for full-screen display on TVs, monitors, or digital signage with Wisconsin Badgers branding.

![Big Ten Standings](https://img.shields.io/badge/Big%20Ten-Standings-C5050C?style=for-the-badge)

## 🏀 Features

### Real-Time Updates
- **Auto-refresh**: Standings update automatically every 15 minutes
- **Live connection status**: Visual indicator shows online/offline state
- **Smart timestamps**: Relative time format ("Today at 7:56 AM")
- **Stale data alerts**: Warning if data hasn't updated in 30+ minutes

### Visual Excellence
- **Team rankings**: Enhanced typography with AP poll rankings displayed
- **Position tracking**: Visual indicators when teams move up or down
- **Wisconsin highlighting**: Special styling for Wisconsin Badgers
- **B1G branding**: Official Big Ten logo in header
- **Conference focus**: Conference records highlighted, overall records shown
- **Responsive design**: Optimized for any screen size

### Display Features
- **Wake lock**: Keeps screen active during display (supported browsers)
- **Background**: Custom basketball court texture
- **Wisconsin fonts**: Official Wisconsin and Aeternus typography
- **Smooth animations**: Professional transitions and effects

## 🚀 Quick Start

### Option 1: Direct Deployment (Recommended)

1. **Fork or clone this repository**
   ```bash
   git clone https://github.com/erikrole/WISC-MBB-Standings.git
   cd WISC-MBB-Standings
   ```

2. **Deploy to your hosting platform**
   - GitHub Pages
   - Cloudflare Pages
   - Netlify
   - Vercel
   - Any static web host

3. **Open in browser and go fullscreen** (F11)

### Option 2: Local Development

```bash
# Serve with any static web server
python -m http.server 8000

# Or use Node.js
npx serve

# Then visit http://localhost:8000
```

## 📊 Data Source

Standings are pulled from a Google Sheets CSV export:
- Automatic updates every 15 minutes
- Manual update available by refreshing the page
- CSV URL configured in `script.js` (line 4-5)

### Data Format

The Google Sheet should have the following columns:
- `Team`: Team name (e.g., "Wisconsin", "Michigan")
- `AP Rank`: Current AP Poll ranking (optional, use 999 or empty for unranked)
- `Conference Record`: Format "W-L" (e.g., "5-2")
- `Overall Record`: Format "W-L" (e.g., "13-5")

## 🎨 Customization

### Update Data Source

Edit `script.js` line 4-5:
```javascript
const CSV_URL = "YOUR_GOOGLE_SHEETS_CSV_EXPORT_URL";
```

### Change Refresh Interval

Edit `script.js` line 7:
```javascript
const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // milliseconds
```

### Customize Colors

Edit CSS variables in `style.css` (lines 4-11):
```css
:root {
  --color-wisconsin: #c5050c;
  --color-white: #ffffff;
  --color-black: #000000;
  /* ... more variables */
}
```

### Highlight a Different Team

Edit `script.js` to change which team gets special highlighting. Search for "Wisconsin" in the `createTeamRow` function (around line 200).

### Change Fonts

Fonts are loaded from the `Aeternus/` directory:
- Wisconsin-Regular.ttf
- Aeternus Nano, Tall, Thin, Heavy
- Gotham Bold & Medium

To use different fonts, replace the files in `Aeternus/` and update `@font-face` rules in `style.css`.

## 🛠️ Technology Stack

- **HTML5**: Semantic markup
- **CSS3**: Custom properties, animations, responsive design
- **Vanilla JavaScript**: No frameworks, pure ES6+
- **Google Sheets**: Data source via CSV export

### Browser Compatibility

- Chrome/Edge: ✅ Full support including wake lock
- Firefox: ✅ Full support
- Safari: ✅ Full support (limited wake lock)
- Mobile browsers: ✅ Responsive design

## 📁 Project Structure

```
WISC-MBB-Standings/
├── index.html              # Main HTML structure
├── style.css              # All styles and animations
├── script.js              # Data fetching and rendering logic
├── B1G Logo White.png     # Big Ten conference logo
├── Court BG 4.jpg         # Background image
├── Aeternus/              # Font files
│   ├── Wisconsin-Regular.ttf
│   ├── 01-aeternus_nano.ttf
│   ├── 02-aeternus_tall.ttf
│   ├── 03-aeternus_thin.ttf
│   ├── 04-aeternus_heavy.ttf
│   ├── Gotham-Bold.otf
│   └── Gotham-Medium.otf
└── README.md              # This file
```

## 🎯 Usage Scenarios

- **Game day displays**: Show live standings at viewing parties
- **Athletic facilities**: Digital signage in gyms and training centers
- **Sports bars**: TV displays for basketball season
- **Office displays**: Keep track of conference standings
- **Personal use**: Always-on display for fans

## 📱 Display Recommendations

### Optimal Settings
- **Resolution**: 1920x1080 or higher
- **Orientation**: Landscape
- **Browser**: Chrome or Edge (best wake lock support)
- **Mode**: Full-screen (F11 or browser full-screen)

### For Digital Signage
1. Open page in full-screen mode
2. Disable browser UI (kiosk mode if available)
3. Enable wake lock by interacting with the page
4. Set display to never sleep

## 🔧 Configuration Options

### Constants in `script.js`

| Constant | Default | Description |
|----------|---------|-------------|
| `REFRESH_INTERVAL_MS` | 15 min | Time between automatic updates |
| `STALE_DATA_THRESHOLD_MS` | 30 min | When to show stale data warning |
| `MAX_RETRY_DELAY_MS` | 5 min | Maximum backoff for failed requests |
| `POSITION_CHANGE_DURATION_MS` | 5 sec | How long to highlight position changes |
| `NO_RANK_VALUE` | 999 | Value indicating unranked in AP Poll |

## 🐛 Troubleshooting

### Standings not updating
- Check browser console for errors
- Verify Google Sheets CSV URL is accessible
- Ensure CSV format matches expected columns
- Check network connection

### Fonts not loading
- Verify font files exist in `Aeternus/` directory
- Check browser console for 404 errors
- Ensure file paths in CSS are correct

### Screen dims/sleeps
- Interact with the page to activate wake lock
- Check browser wake lock support
- Use a browser extension to prevent sleep
- Configure OS display settings

### Background image not showing
- Verify `Court BG 4.jpg` exists
- Check file path in `style.css`
- Ensure image file isn't corrupted

## 🤝 Contributing

This is a personal project, but suggestions and improvements are welcome:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is for personal and educational use. Fonts and logos belong to their respective owners.

### Credits
- **Big Ten Conference**: Logo and branding
- **University of Wisconsin**: Wisconsin font and branding
- **Fonts**: Aeternus font family, Gotham font family

## 🎓 About

Created for displaying Big Ten basketball standings with Wisconsin Badgers branding. Built with performance and reliability in mind for 24/7 display scenarios.

---

**Live Demo**: [mbb-standings.erikrole.com](https://mbb-standings.erikrole.com)
**Production**: [wisc-mbb-standings.pages.dev](https://wisc-mbb-standings.pages.dev)

Go Badgers! 🦡🏀
