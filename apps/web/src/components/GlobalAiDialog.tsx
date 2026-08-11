"use client";

import { useEffect, useState } from "react";
import { Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const aiPromptStorageKey = "wanderlust:pending-ai-prompt";
const openGlobalAiDialogEvent = "wanderlust:open-global-ai-dialog";

type OpenGlobalAiDialogEventDetail = {
  prompt?: string;
};

export function GlobalAiDialog() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    function openFromEvent(event: Event) {
      const nextPrompt =
        event instanceof CustomEvent
          ? (event.detail as OpenGlobalAiDialogEventDetail | undefined)?.prompt?.trim() ?? ""
          : "";
      if (nextPrompt) setPrompt(nextPrompt);
      setOpen(true);
    }

    window.addEventListener(openGlobalAiDialogEvent, openFromEvent);
    return () => window.removeEventListener(openGlobalAiDialogEvent, openFromEvent);
  }, []);

  function submitPrompt() {
    const nextPrompt = prompt.trim();
    setOpen(false);

    if (document.getElementById("editor")) {
      window.location.hash = "editor";
      window.dispatchEvent(new CustomEvent("wanderlust:open-ai-assistant", { detail: { prompt: nextPrompt } }));
      setPrompt("");
      return;
    }

    if (nextPrompt) {
      window.sessionStorage.setItem(aiPromptStorageKey, nextPrompt);
    }
    window.location.href = "/?ai=1#editor";
  }

  return (
    <>
      <button className="global-ai-launcher" type="button" onClick={() => setOpen(true)} aria-label="打开 AI 修改窗口" title="AI 修改路书">
        <Sparkles size={20} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="global-ai-dialog-content" aria-label="全局 AI 修改窗口">
          <DialogHeader className="global-ai-dialog-heading">
            <div className="global-ai-dialog-mark">
              <Sparkles size={18} />
            </div>
            <div>
              <DialogTitle>AI 修改路书</DialogTitle>
              <DialogDescription>输入一句话，进入当前路书的可确认修改预览。</DialogDescription>
            </div>
          </DialogHeader>
          <Textarea
            className="global-ai-dialog-input"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="例如：把第三天节奏放松一点，晚餐换成更有当地特色的选择。"
            autoFocus
          />
          <div className="global-ai-dialog-actions">
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              <X size={17} />
              <span>关闭</span>
            </Button>
            <Button type="button" onClick={submitPrompt}>
              <Send size={17} />
              <span>进入预览</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

