import express from "express";
import dotenv from "dotenv";
import cors from "cors";
// import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import mongoose from "mongoose";


// import userRoutes from "./routes/userRoutes.js";
// import restaurantRoutes from "./routes/restaurantRoutes.js";
// import orderRoutes from "./routes/orderRoutes.js";

dotenv.config();
// connectDB();

const app = express();
app.use(cors());
app.use(express.json());

// Connect DB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

// Routes
app.use("/api/auth", authRoutes);
// app.use("/api/users", userRoutes);
// app.use("/api/restaurants", restaurantRoutes);
// app.use("/api/orders", orderRoutes);

app.get("/", (req, res) => {
  res.status(200).send("API is running...");
});


const PORT = process.env.PORT || 5050;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
