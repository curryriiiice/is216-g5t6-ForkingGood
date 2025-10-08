import express from 'express';
import cors from "cors";
import env from "dotenv";
env.config();


const app = express();


// for parsing JSON bodies
app.use(express.json()); 

// this allows all origins, replace it before deployment
app.use(cors()); 

// replace it with this! 
// app.use(cors({
//   origin: "http://localhost:3000", 
//   credentials: true
// }));

// for parsing URL-encoded form data
app.use(express.urlencoded({ extended: true })); 

// check if server is running
app.listen(8000, () => console.log('Server running on port http://localhost:8000'));


// import and use exported routes from groupRouter 
import friendsRoutes from './routers/friendsRouter.js';
import mapRoutes from './routers/mapRouter.js';
import restaurantRoutes from './routers/restaurantRouter.js';
import searchRoutes from './routers/searchRouter.js';
import userRoutes from './routers/userRouter.js';



app.use('/friends', friendsRoutes);
app.use('/map', mapRoutes);
app.use('/restaurants', restaurantRoutes);
app.use('/search', searchRoutes);
app.use('/users',userRoutes);