# IS216 G5T6 - Food Recommendation Tracker

A web application to easily track food recommendations from friends and conveniently share food places and restaurants.

## Description

We love receiving food recommendations from friends, but we often struggle to keep track of them. Recommendations shared through messaging apps tend to get buried in conversations, making it challenging and tedious to scroll back and find them later. We realised that having a centralised, social platform to manage these recommendations would be both enjoyable and practical. This inspired us to create a web application that allows us to easily track food recommendations from friends and conveniently share places we personally enjoyed visiting.

## Features

- **Account Creation & Friend system**: User will be able to create a personal account that he can access his saved recommendations and add friends to view their recommendations to discover new places to eat. Friends can also like and comment on posts.
- **Ranking system**: User can add new restaurant recommendations with details (photos, rating, review description)
- **Interactive Map with Pinned Locations**: A map view containing a user's friend circle's recommendations 
- **Search & Filtering**: randomise, search and filter recommendations based on cuisine type, price range and location
- **Reverse Image Search and Recognition**: When a user snaps or uploads a photo of a dish, recommendations of restaurants serving similar dishes can be provided

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

## Technology Stack

**Frontend:**
- Vue.js
- Bootstrap
- CSS3
- HTML5
- **Deployed on Netlify**

**Backend:**
- Node.js
- Express.js
- Supabase
- Supabase JWT Authentication
- **Deployed on Netlify**

## APIs Used

- **Google Maps API**: [https://developers.google.com/maps](https://developers.google.com/maps) - For interactive maps and location services
- **Google Cloud Vision API**: [https://cloud.google.com/vision](https://cloud.google.com/vision) - For reverse image search and dish recognition

## Support

For any issues or questions, please contact the development team or create an issue in the GitHub repository.
