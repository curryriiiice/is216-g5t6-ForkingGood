import express from "express";
const router = express.Router();
//import {task1,task2,etc} from "../controllers/taskController";
import {
    cuisineFilter, 
    getPostbyCuisine,

}from '../controllers/mapController.js';

//router.get
//router.post etc etc for each of the routes
// eg router.post('/getGroups',getGroups);

router.post("/getFriendsCuisines", cuisineFilter);
router.post("/getPostbyCuisine", getPostbyCuisine);

export default router;