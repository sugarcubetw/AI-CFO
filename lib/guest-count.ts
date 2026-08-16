const roomCapacities: Record<string, number> = {
  "201": 2, "202": 2, "203": 2, "204": 4,
  "301": 2, "302": 2, "303": 2,
};

export function estimatedGuestCount(roomNumber: string | null, specialRequests: string | null = null) {
  const multiRoomSection = specialRequests?.match(/多房訂單：([^；\n]+)/)?.[1] ?? "";
  const multiRooms = [...new Set(multiRoomSection.match(/\b(?:201|202|203|204|301|302|303)\b/g) ?? [])];
  if (multiRooms.length > 1) return multiRooms.reduce((total, room) => total + (roomCapacities[room] ?? 2), 0);
  return roomCapacities[roomNumber ?? ""] ?? 2;
}

export function hasVerifiedGuestCount(sourceSystem: string, importState: string) {
  return sourceSystem !== "owlnest_export" || importState === "confirmed";
}
