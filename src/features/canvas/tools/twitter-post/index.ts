import { lazy } from "react";
import { registerTool } from "../registry";
import { TwitterPostToolDataSchema } from "./schema";

const TwitterPostTool = lazy(() =>
  import("./TwitterPostTool").then((m) => ({ default: m.TwitterPostTool })),
);

registerTool({
  id: "twitter-post",
  displayName: "Twitter/X Post",
  schema: TwitterPostToolDataSchema,
  component: TwitterPostTool,
});
