const { ApolloServer } = require("apollo-server");
import cron from "node-cron";

import {
  typeDefs as userTypes,
  resolvers as userResolvers,
} from "./User/User.js";
import {
  typeDefs as eventTypes,
  resolvers as eventResolvers,
} from "./Event/Event";
import {
  typeDefs as troopTypes,
  resolvers as troopResolvers,
} from "./ScoutHierarchy/TroopAndPatrol";
import {
  typeDefs as fileTypes,
  resolvers as fileResolvers,
} from "./Event/SharedAssets";
import { typeDefs as authTypes, resolvers as authResolvers } from "./Auth/Auth";

// Models
import User from "../models/User";
import Event from "../models/Event";
import Troop from "../models/TroopAndPatrol";

import * as authFns from "./utils/Auth";
import mongoose from "mongoose";
import {
  getUserNotificationData,
  sendNotifications,
} from "./Notifications/Expo.js";
mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useCreateIndex: true,
  useUnifiedTopology: true,
  useFindAndModify: true,
});
mongoose.set("useFindAndModify", true);

const mongo = mongoose.connection;
mongo.on("error", console.error.bind(console, "connection error:"));
mongo.once("open", function () {
  console.log("Database connected!");
});

cron.schedule("* * * * *", async () => {
  const oneDayReminderEvents = await Event.find({
    notification: { $lte: new Date() },
  });
  if (oneDayReminderEvents !== []) {
    oneDayReminderEvents.map(async (event) => {
      const tokens = await getUserNotificationData(Troop, User, event.troop);
      sendNotifications(
        tokens,
        `Friendly ScoutTrek Reminder that ${event.title} happens tomorrow!`,
        { type: "event", eventType: event.type, ID: event.id }
      );
      event.notification = undefined;
      event.save();
    });
  }
});

const apolloServer = new ApolloServer({
  typeDefs: [userTypes, fileTypes, eventTypes, troopTypes, authTypes],
  resolvers: [
    userResolvers,
    fileResolvers,
    eventResolvers,
    troopResolvers,
    authResolvers,
  ],
  context: async ({ req }) => {
    const user = await authFns.getUserFromToken(
      authFns.getTokenFromReq(req),
      User
    );

    // Update this for membership paradigm
    const membership = req.headers?.membership;

    const membershipIDString =
      membership === "undefined"
        ? undefined
        : mongoose.Types.ObjectId(membership).toString();

    let currMembership;

    if (membershipIDString && user) {
      currMembership = user.groups.find((membership) => {
        return membership._id.equals(membershipIDString);
      });
    }

    const tokens = currMembership
      ? await getUserNotificationData(Troop, User, currMembership.troopID)
      : null;

    return {
      User,
      Event,
      Troop,
      membershipIDString,
      currMembership,
      tokens,
      req,
      authFns,
      user,
    };
  },
  introspection: true,
  playground: true,
});

export default apolloServer;
