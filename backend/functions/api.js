import express from 'express';
import cors from "cors";
import env from "dotenv";
import serverless from 'serverless-http';
import { createClient } from '@supabase/supabase-js';

env.config();

const app = express();

// for parsing JSON bodies
app.use(express.json()); 

// CORS configuration - allows requests from ANY origin
app.use(cors({
  origin: true, // Allow any origin
  credentials: true // Allow cookies/auth headers
}));

// for parsing URL-encoded form data
app.use(express.urlencoded({ extended: true })); 

// Supabase Auth Middleware
const supabaseAuth = async (req, res, next) => {
  try {
    // Skip auth for certain routes if needed
    if (req.path === '/health' || req.method === 'OPTIONS') {
      return next();
    }

    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7); // Remove "Bearer "
    
    // Verify the token with Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// Apply Supabase auth to all routes
app.use(supabaseAuth);

// Health check route (optional but useful)
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// import and use exported routes from routers
import friendsRoutes from '../routers/friendsRouter.js';
import mapRoutes from '../routers/mapRouter.js';
import restaurantRoutes from '../routers/restaurantRouter.js';
import searchRoutes from '../routers/searchRouter.js';
import userRoutes from '../routers/userRouter.js';

// Use your routes with /api prefix for Netlify
app.use('/api/friends', friendsRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/user', userRoutes);

// Handle 404 for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Export the serverless function
export const handler = serverless(app, {
    request: (req, event, context) => {
        // Parse body if it's a string (API Gateway sometimes stringifies)
        if (event.body && typeof event.body === 'string') {
        try {
            req.body = JSON.parse(event.body);
        } catch (e) {
            // Leave as string if not JSON
        }
        }
        return req;
    }
    });