import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bold, Italic, Strikethrough, List, ListOrdered, Heading2 } from "lucide-react";
import type { NoteJSON } from "@/lib/qa/notes.functions";

type Props = {
  value: NoteJSON;
  onChange: (v: { json: NoteJSON; text: string }) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

export function NoteEditor({ value, onChange, placeholder, autoFocus }: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder ?? "Start typing…" }),
    ],
    content: value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0 ? value : "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[160px] focus:outline-none px-3 py-2",
      },
    },
    onUpdate: ({ editor }) => {
      onChange({ json: editor.getJSON() as NoteJSON, text: editor.getText() });
    },
  });

  useEffect(() => {
    if (autoFocus && editor) editor.commands.focus("end");
  }, [autoFocus, editor]);

  if (!editor) return <div className="min-h-[160px] rounded-md border bg-background/60" />;

  return (
    <div className="rounded-md border bg-background/60">
      <div className="flex items-center gap-1 border-b px-2 py-1">
        <ToolbarBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></ToolbarBtn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" size="sm" variant={active ? "secondary" : "ghost"} className="h-7 w-7 p-0" onClick={onClick}>
      {children}
    </Button>
  );
}