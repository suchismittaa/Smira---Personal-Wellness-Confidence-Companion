# 🌸 Smira — Personal Wellness & Confidence Companion

> A React-based personal wellness dashboard combining AI skin analysis, confidence tracking, emotional journaling, and holistic health monitoring — all in a beautiful dusky rose/deep plum aesthetic.

---

## ✨ Features

### 🔬 Skin Scan & Analysis
- AI-powered skin analysis using webcam or uploaded image
- Detects concerns like acne, pigmentation, dryness, and oiliness
- Interactive concern zone overlay on face image
- Scan history stored locally (last 15 scans)

### 💕 Confidence Score™
- Proprietary composite score based on habits, hydration, journaling, and skin progress
- Animated score rings with per-dimension breakdowns
- Tracks confidence trends over time

### 📖 Glow Journal
- Emotional wellness journaling with mood tagging
- Tracks feelings alongside skin condition entries
- Supports reflection on patterns between mood and skin health

### 🤖 AI Coach
- Emotionally intelligent conversational AI coach
- Personalized advice based on user profile, scan history, and goals
- Chat history persisted locally

### 📊 Analytics & Journey
- Weekly trend charts (acne score, hydration, brightness, confidence)
- Radar chart for multi-dimensional skin health overview
- Scan-over-scan progress comparison

### 🔮 Skin Forecast
- Predictive skin health outlook based on logged data trends

### 🏆 Community Challenges
- Join wellness challenges (hydration streaks, SPF habits, etc.)
- Track personal progress and streaks

### 📅 Menstrual Cycle Tracker
- Logs period dates and cycle length
- Provides hormonal skin insights tied to cycle phase

### 🛒 Product Recommendations
- Curated skincare product suggestions based on scan results and skin goals

### 🥗 Nutrition Guidance
- Food trigger correlation with skin condition
- Personalized nutrition tips based on diet preference and skin goals

### 📖 Monthly Smira Story
- Auto-generated monthly recap of skin progress, habits, and journal highlights

### 🤖 Avatar Companion
- Floating AI avatar that delivers contextual wellness nudges and motivational messages

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | React (functional components + hooks) |
| Charts | Recharts (Line, Area, Bar, Radar) |
| Styling | Inline CSS + global `<style>` injection |
| Fonts | Google Fonts — Cormorant Garamond, DM Sans |
| Storage | `localStorage` (persisted across sessions) |
| State | `useState`, `useEffect`, `useRef`, `useCallback` |

---

## 🎨 Design System

The UI uses a custom dusky rose → deep plum palette:

| Variable | Hex | Role |
|---|---|---|
| `--dp` | `#1A0B12` | Deepest background |
| `--deep` | `#2E0E1F` | Dark background |
| `--plum` | `#4A1530` | Card backgrounds |
| `--wine` | `#6B2244` | Secondary accents |
| `--berry` | `#8B3A57` | Buttons, highlights |
| `--rose` | `#B55C79` | Primary accent |
| `--blush` | `#D4879A` | Text accents, borders |
| `--petal` | `#F0C4CC` | Soft text |
| `--mist` | `#F5E6EA` | Primary text |

Typography uses **Cormorant Garamond** (display/headings) and **DM Sans** (body/UI).

---

## 🗂️ App Structure

```
smira-v3.jsx
├── GlobalStyles          # CSS variables, animations, global styles
├── Ic                    # SVG icon component
├── Ring                  # Animated circular score ring
├── ConfBar               # Animated progress bar
├── SkinTip               # Rotating wellness tip card
├── Landing               # Welcome/intro screen
├── Onboarding            # 6-step user profile setup
├── Dashboard             # Main home overview
├── SkinScan              # Camera/upload + analysis
├── Results               # Scan result detail view
├── ConfidenceScore       # Confidence Score™ breakdown
├── GlowJournal           # Mood & wellness journal
├── AICoach               # Chat-based AI wellness coach
├── Analytics             # Charts and trend analysis
├── Journey               # Scan history & progress
├── MonthlyStory          # Monthly progress recap
├── Products              # Product recommendations
├── Nutrition             # Food & diet guidance
├── Challenges            # Community wellness challenges
├── MenstrualTracker      # Cycle logging & insights
├── AvatarCompanion       # Floating AI avatar bubble
├── Sidebar               # Navigation sidebar
└── App (root)            # Screen + page routing
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 16+
- A React environment (Create React App, Vite, or similar)

### Installation

```bash
# Clone or copy smira-v3.jsx into your project
# Install dependencies
npm install recharts

# Run the app
npm start
# or
npm run dev
```

### Usage

1. On first launch, you'll see the **Landing** screen — click *Enter* to begin.
2. Complete the **6-step onboarding** to set up your profile (name, skin goals, health conditions, wellness goals).
3. Navigate via the **sidebar** to any module.
4. Run a **Skin Scan** using your webcam or an uploaded photo.
5. Explore **Confidence Score**, **Glow Journal**, **AI Coach**, and other features.
6. All data is saved automatically to `localStorage` under the `smira3_*` namespace.

> ⚠️ To reset all data, click the **Reset** button in the top bar.

---

## 💾 Data Persistence

All user data is stored in `localStorage` with the prefix `smira3_`. No data is sent to any external server.

| Key | Contents |
|---|---|
| `smira3_user3` | User profile (name, age, goals, health flags) |
| `smira3_results3` | Latest skin scan results |
| `smira3_scans3` | Scan history (last 15) |
| `smira3_habits3` | Daily habit tracker state |
| `smira3_glowJournal` | Journal entries |
| `smira3_coachMsgs3` | AI coach chat history |
| `smira3_cycles` | Menstrual cycle logs |

---

## 📱 Responsive Design

Smira V3 is fully responsive:

- **Desktop:** Full sidebar navigation always visible
- **Mobile (≤768px):** Hamburger menu with slide-in sidebar overlay, stacked layouts, touch-optimized buttons

---

## ⚠️ Disclaimer

> Smira is not a medical device. All skin analysis, scores, and recommendations are for informational and wellness purposes only. Please consult a qualified dermatologist for medical advice regarding skin conditions.

---

## 📄 License

This project is for personal/portfolio use. Please credit the original author if sharing or adapting.
