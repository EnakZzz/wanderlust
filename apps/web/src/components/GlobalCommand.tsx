"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { LayoutDashboard, MapPinned, Route, Search, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const commandItems = [
  { label: "打开控制台", hint: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "查看全部路书", hint: "Journeys", href: "/journeys", icon: Route },
  { label: "打开旅行足迹", hint: "Passport", href: "/passport", icon: MapPinned },
  { label: "搜索目的地", hint: "Search", href: "/search", icon: Search },
  { label: "进入 AI 路书编辑", hint: "Prompt", href: "/#editor", icon: Sparkles }
];

export function GlobalCommand() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function runCommand(href: string) {
    setOpen(false);
    window.location.href = href;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="command-dialog-content" aria-label="全局命令窗口">
        <DialogHeader className="command-dialog-heading">
          <DialogTitle>快速操作</DialogTitle>
          <DialogDescription>搜索页面和常用路书动作。</DialogDescription>
        </DialogHeader>
        <Command className="command-menu" loop>
          <Command.Input className="command-input" placeholder="搜索控制台、路书、AI..." />
          <Command.Empty className="command-empty">没有匹配结果</Command.Empty>
          <Command.List className="command-list">
            {commandItems.map((item) => (
              <Command.Item key={item.href} className="command-item" value={`${item.label} ${item.hint}`} onSelect={() => runCommand(item.href)}>
                <item.icon size={17} />
                <span>{item.label}</span>
                <small>{item.hint}</small>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
