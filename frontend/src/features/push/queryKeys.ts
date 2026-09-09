export const pushKeys = {
  all: ["push"] as const,
  subscription: () => [...pushKeys.all, "subscription"] as const,
};
