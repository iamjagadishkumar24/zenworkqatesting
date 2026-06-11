import { createFileRoute } from "@tanstack/react-router";
import { TestingModule } from "@/components/qa/TestingModule";

const ITEMS = ["Knowledge Base", "Conversation Flows", "Hand-off to Agent", "Tone & Tone-style", "Multilingual"];

export const Route = createFileRoute("/_app/chatbot-testing")({
  component: () => (
    <TestingModule
      title="Chatbot Testing"
      description="QA conversational flows, intents and hand-off behaviour."
      module="Integrations"
      items={ITEMS}
      itemLabel="flow"
    />
  ),
});