// Discord bot disabled due to version incompatibility
export const discordClient: any = {
  users: { fetch: async () => null },
  channels: { fetch: async () => null },
  isReady: () => false,
  login: async () => '',
};

export async function startDiscordBot() {
  console.log('Discord bot disabled');
}

export async function sendDirectMessage(userId: string, message: any) {
  console.log('Discord DM disabled');
}

export async function editMessage(channelId: string, messageId: string, content: any) {
  console.log('Discord edit disabled');
}

export async function sendSignalToUser(userId: string, message: any) {
  console.log('Discord sendSignalToUser disabled');
}
