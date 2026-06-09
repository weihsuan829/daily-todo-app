import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { useEffect } from "react";

async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch("/api/upload-image", {
    method: "POST",
    body: fd,
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error("upload failed");
  const data = (await res.json()) as { url: string };
  return data.url;
}

export default function NoteEditor({
  content,
  onChange,
}: {
  content: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit, Image],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none outline-none min-h-[200px] px-1 py-1",
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) {
              event.preventDefault();
              uploadImage(file)
                .then((url) => {
                  editor?.chain().focus().setImage({ src: url }).run();
                })
                .catch(() => {
                  /* ignore upload failure */
                });
              return true;
            }
          }
        }
        return false;
      },
    },
  });

  // keep editor in sync when the `content` prop changes (e.g. switching notes)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  return <EditorContent editor={editor} />;
}
