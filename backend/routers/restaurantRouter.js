import express from "express";
const router = express.Router();
//import {task1,task2,etc} from "../controllers/taskController";
import {
    getRestaurantbyId
}from '../controllers/restaurantController.js';

//router.get
//router.post etc etc for each of the routes
// eg router.post('/getGroups',getGroups);

router.post("/getRestaurantbyId", getRestaurantbyId); 


export default router;