import express from "express";

const app = express();

const port = 3001;

app.use(express.json());

app.get("/", (req: any, res: any) => {
  res.send("Server is running!");
});

app.get("/api", (req: any, res: any) => {
  res.json({ message: "Success" });
});

app.listen(port, () => {
  console.log(`API listening at port: {port}`);
});

//post to call an order when it comes
app.post("/order", (req, res) => {
  //create a new order
  const order: Order = { id: Date.now(), status: "pending" };
  orders.push(order);
  //dispatch it
  dispatchOrder(order);

  res.status(200).send(`Order is successfuly now ${order.status}!`);
});

interface Driver {
  id: number;
  available: boolean;
}

interface Order {
  id: number;
  status: OrderStatus;
}

type OrderStatus = "pending" | "assigned" | "completed";

let drivers: Driver[] = [];
let orders: Order[] = [];

//push a sample order in it
drivers.push({ id: 1, available: true });
orders.push({ id: 1, status: "pending" });

//check for available driver
function findAvailableDriver() {
  const driver = drivers.find((driver) => driver.available === true);

  return driver;
}

//dispatch the order we made
function dispatchOrder(order: Order) {
  //find a driver for the order
  let driver = findAvailableDriver();
  if (driver) {
    //update driver
    driver.available = false;
    //update order
    order.status = "assigned";
  }
}

export default app;
