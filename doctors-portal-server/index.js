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

        // 01. get all services
        app.get('/service', async(req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        });

        // 03. get available slots | Find available time slots for a day
        app.get('/available', async(req, res) => {
          const date = req.query.date || 'Jan 7, 2023';

          // step 1: get all services
          const services = await serviceCollection.find().toArray();

          // step 2: get the booking of that day | get all booked services
          const query = {date: date};
          const bookings = await bookingCollection.find(query).toArray();

          // step 3: for each service, find bookings for that service
          services.forEach(service => {
            // Booked Service
            const serviceBookings = bookings.filter(b => b.treatment === service.name);

            // Booked Slots
            const booked = serviceBookings.map(s => s.slot);
            service.booked = booked;

            // service.booked = serviceBookings.map(s => s.slot);

            // Available Slots (Search Keyword: JavaScript algorithm to file elements from ane array that do not exist in another array)
            const available = service.slots.filter(s => !booked.includes(s));

            service.available = available;            
            // Each service: {_id, name, slots, booked, available}
          });

          res.send(services);
        })

        /* 
            *** API Naming Convention ***

            - app.get('/booking') // get all booking in this collection OR get more than one Or by filter/query
            - app.get('/booking/:id') // get a specific booking
            - app.post('/booking') // add a new booking
            - app.patch('/booking/:id') // specific one
            - app.delete('/booking/:id') // specific one
        */

        // 02. get all booked services
        app.post('/booking', async(req, res) => {
          const booking = req.body;
          const query = {treatment: booking.treatment, date: booking.date, patient: booking.patient};
          const exists = await bookingCollection.findOne(query);
          // Limit one booking per user per treatment per day
          if (exists) {
            return res.send({success: false, booking: exists});
          }
          const result = await bookingCollection.insertOne(booking);
          return res.send({success: true, result});
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