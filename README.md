# IS216 G5T6 - Food Recommendation Tracker

A web application to easily track food recommendations from friends and conveniently share food places and restaurants.

## URLs

- **Live Application**: [https://forking-good.netlify.app/]
- **GitHub Repository**: [https://github.com/curryriiiice/is216-g5t6-ForkingGood]

## Project Structure

```
is216-g5t6/
├── frontend/          # Vue.js frontend application
├── backend/           # Node.js and Express.js backend API server
└── README.md
```

## How to Run the Application Locally

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation & Setup

1. **Clone the repository**
```bash
git clone https://github.com/curryriiiice/is216-g5t6-ForkingGood.git
cd is216-g5t6-ForkingGood
```

2. **Set up the Backend**
```bash
cd backend
npm install
```

3. **Set up the Frontend**
```bash
cd ../frontend
npm install
```

4. **Run the Application**

**Run both services simultaneously**

- Terminal 1 (Backend):
```bash
cd backend
nodemon app.js
# or if nodemon is not available:
node app.js
```

- Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```


5. **Access the Application**
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000

## Environment Configuration

### Backend (.env)
```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_KEY=your_supabase_service_role_key
SUPABASE_JWT_SECRET=your_supabase_jwt_secret
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
GOOGLE_VISION_API_KEY=your_google_vision_api_key
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Frontend (.env)
```env
VITE_API_BASE_URL=http://localhost:8000
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Features

- Share food recommendations with friends
- Track and organize favorite restaurants
- Rate and review food places
- Social features for food discovery
- User authentication and profiles
- Reverse image searching to locate restaurants with similar dishes

## Technology Stack

**Frontend:**
- Vue.js
- Bootstrap
- CSS3
- HTML5

**Backend:**
- Node.js
- Express.js
- Supabase
- Supabase JWT Authentication

## Support

For any issues or questions, please contact the development team or create an issue in the GitHub repository.
