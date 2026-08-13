import type { Attachment, Booking, BudgetItem, PackingItem, Place } from "@wanderlust/domain";

import type { EditorModule } from "./types";

export const storageKey = "wanderlust.editorDraft.v2";
export const offlineStorageKey = "wanderlust.offlineBundles.v1";

export const moduleCopy: Record<EditorModule, string> = {
  itinerary: "按天整理路线、顺序、备注和地点目标，手机端可离线查看。",
  places: "地点只保存一次，可复用到行程、地图、天气和搜索。",
  map: "用坐标预览路线分布，并打开 Google 地点页。",
  bookings: "把确认单和上传文件关联到当前路书。",
  files: "集中管理护照、签证、票券、保险、收据和确认单。",
  packing: "跟踪证件、衣物、电子设备、健康用品、现金卡券和自定义物品。",
  budget: "记录谁付款、谁分摊，并自动计算结算建议。",
  ai: "生成路书草稿，或把粘贴的旅行材料整理成可检查的路书。"
};

export const placeCategories: Place["category"][] = ["culture", "nature", "food", "architecture", "hotel", "transport", "shopping", "other"];
export const bookingTypes: Booking["type"][] = ["flight", "hotel", "train", "restaurant", "ticket", "car", "other"];
export const packingCategories: PackingItem["category"][] = ["documents", "clothing", "electronics", "health", "money", "toiletries", "other"];
export const attachmentCategories: Attachment["category"][] = ["passport", "visa", "hotel", "ticket", "transport", "insurance", "receipt", "other"];
export const budgetCategories: BudgetItem["category"][] = ["accommodation", "transport", "food", "tickets", "shopping", "other"];
