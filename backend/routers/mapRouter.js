import express from "express";
const router = express.Router();
//import {task1,task2,etc} from "../controllers/taskController";
import {
    getAllCuisines, 
    getFilteredPosts,
    getAllLocations,

}from '../controllers/mapController.js';

//router.get
//router.post etc etc for each of the routes
// eg router.post('/getGroups',getGroups);

router.post("/getFilteredPosts", getFilteredPosts)
router.get("/getAllCuisines", getAllCuisines);
router.get("/getAllLocations", getAllLocations)

export default router;