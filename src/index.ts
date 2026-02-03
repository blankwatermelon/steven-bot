import { Client, Events, GatewayIntentBits, Interaction } from 'discord.js';
import ffmpeg from 'ffmpeg-static';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// Ensure ffmpeg is in the PATH for child processes
if (ffmpeg) {
    const path = require('path');
    const ffmpegDir = path.dirname(ffmpeg);
    process.env.PATH = `${ffmpegDir}:${process.env.PATH}`;
}

const token = process.env.DISCORD_TOKEN;

if (!token) {
    console.error('DISCORD_TOKEN is missing from .env file.');
    process.exit(1);
}

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

import { PlayCommand }  from './commands/Play';
import { SkipCommand }  from './commands/Skip';
import { LeaveCommand } from './commands/Leave';
import { QueueCommand } from './commands/Queue';
import { Command } from './interfaces/Command';

const commands = [PlayCommand, SkipCommand, LeaveCommand, QueueCommand];
const commandMap = new Map<string, Command>();

for (const command of commands) {
    commandMap.set(command.data.name, command);
}

client.once(Events.ClientReady, async (c) => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
    
    // Register commands for all guilds (simplification for "build it")
    // In production, you might want to register global commands effectively.
    // Here we just set them for the application.
    await c.application?.commands.set(commands.map(cmd => cmd.data));
    console.log('Commands successfully registered!');
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
	if (!interaction.isChatInputCommand()) return;

    const command = commandMap.get(interaction.commandName);

    if (!command) return;

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
        if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
		} else {
			await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
		}
	}
});

client.login(token).catch(error => {
    console.error('Failed to login to Discord. Please check your DISCORD_TOKEN in .env file.');
    console.error(error);
    process.exit(1);
});
