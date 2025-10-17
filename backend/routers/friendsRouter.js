import express from "express";
const router = express.Router();
//import {task1,task2,etc} from "../controllers/taskController";
import {
    getFriends,
    
}from '../controllers/friendsController.js';

//router.get
//router.post etc etc for each of the routes
// eg router.post('/getGroups',getGroups);

router.post("/getFriends", getFriends);

export default router;