import StoryStudio from "./studio";
import { env } from "@/lib/server/runtime";

export default function Home() {
  return <StoryStudio privateLogin={Boolean(env.IS_VERCEL)} />;
}
