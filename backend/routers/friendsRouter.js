import express from "express";
const router = express.Router();
//import {task1,task2,etc} from "../controllers/taskController";
import {
    getFriends,
    acceptFriendReq,
    rejectFriendReq,
    sendFriendReq,



}from '../controllers/friendsController.js';

//router.get
//router.post etc etc for each of the routes
// eg router.post('/getGroups',getGroups);

router.post("/getFriends", getFriends);
router.post("/acceptFriendReq", acceptFriendReq);
router.post("/rejectFriendReq", rejectFriendReq);
router.post("/sendFriendReq", sendFriendReq); 



export default router;