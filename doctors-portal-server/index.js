const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// connection setup with database with secure password on environment variable
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nywkbwu.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        // console.log('doctor_portal database connected');
        const serviceCollection = client.db("doctors_portal").collection("services");
        const bookingCollection = client.db("doctors_portal").collection("bookings");

        app.get('/service', async(req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        });

        /* 
            *** API Naming Convention ***

            - app.get('/booking') // get all booking in this collection OR get more than one Or by filter/query
            - app.get('/booking/:id') // get a specific booking
            - app.post('/booking') // add a new booking
            - app.patch('/booking/:id') // specific one
            - app.delete('/booking/:id') // specific one
        */

        app.post('/booking', async(req, res) => {
          const booking = req.body;
          const query = {treatment: booking.treatment, date: booking.date, patient: booking.patient};
          const result = await bookingCollection.insertOne(booking);
          res.send(result);
        });
    }
    finally {
        // await client.close(); // commented, if I want to keep connection active;
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello from Doctors Portal!');
});

app.listen(port, () => {
  console.log(`Doctor Portal app listening on port ${port}`);
});