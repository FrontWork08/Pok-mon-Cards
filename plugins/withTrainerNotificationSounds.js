const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

const SOUND_FILES = [
  'tc_default.wav',
  'tc_battle.wav',
  'tc_social.wav',
  'tc_trade.wav',
];

module.exports = function withTrainerNotificationSounds(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidRoot = config.modRequest.platformProjectRoot;
      const rawDir = path.join(androidRoot, 'app', 'src', 'main', 'res', 'raw');

      await fs.mkdir(rawDir, { recursive: true });

      for (const fileName of SOUND_FILES) {
        const source = path.join(projectRoot, 'assets', 'sounds', fileName);
        const destination = path.join(rawDir, fileName);
        const sourceStat = await fs.stat(source);
        if (!sourceStat.isFile() || sourceStat.size < 1000) {
          throw new Error(`Trainer notification sound is missing or invalid: ${fileName}`);
        }
        await fs.copyFile(source, destination);
        const destinationStat = await fs.stat(destination);
        if (destinationStat.size !== sourceStat.size) {
          throw new Error(`Trainer notification sound copy failed: ${fileName}`);
        }
      }

      console.log('Trainer Collection notification sounds copied to Android res/raw.');
      return config;
    },
  ]);
};
