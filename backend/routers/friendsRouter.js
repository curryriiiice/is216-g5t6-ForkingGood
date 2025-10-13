import express from "express";
const router = express.Router();
//import {task1,task2,etc} from "../controllers/taskController";
import {
    getFriends,
    getFriendRecs
}from '../controllers/friendsController.js';

//router.get
//router.post etc etc for each of the routes
// eg router.post('/getGroups',getGroups);

router.post("/getFriends", getFriends);
router.post("/getFriendRecs", getFriendRecs);

export default router;