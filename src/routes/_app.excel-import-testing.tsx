import { createFileRoute } from "@tanstack/react-router";
import { TestingModule } from "@/components/qa/TestingModule";

const ITEMS = ["Knowledge Base", "Conversation Flows", "Hand-off to Agent", "Tone & Tone-style", "Multilingual"];

export const Route = createFileRoute("/_app/excel-import-testing")({
  component: () => (
    <TestingModule
      title="Chatbot Testing"
      description="QA conversational flows, intents and hand-off behaviour."
      module="Chatbot Testing"
      items={ITEMS}
      itemLabel="flow"
    />
  ),
});