const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

const SOUND_FILES = [
  'tc_default.wav',
  'tc_battle.wav',
  'tc_social.wav',
  'tc_trade.wav',
];

const GRADLE_START = '// TRAINER_NOTIFICATION_SOUNDS_START';
const GRADLE_END = '// TRAINER_NOTIFICATION_SOUNDS_END';

function withTrainerSoundGradleHook(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('Trainer notification sound safeguard expects Groovy android/app/build.gradle.');
    }

    let contents = config.modResults.contents;
    const startIndex = contents.indexOf(GRADLE_START);
    const endIndex = contents.indexOf(GRADLE_END);
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      contents = `${contents.slice(0, startIndex)}${contents.slice(endIndex + GRADLE_END.length)}`.trimEnd();
    }

    const includes = SOUND_FILES.map((fileName) => `        include '${fileName}'`).join('\n');
    const block = `\n\n${GRADLE_START}\n` +
      `def trainerNotificationSoundSourceDir = file('../../assets/sounds')\n` +
      `def trainerNotificationSoundTargetDir = file('src/main/res/raw')\n` +
      `def copyTrainerNotificationSounds = tasks.register('copyTrainerNotificationSounds', Copy) {\n` +
      `    from(trainerNotificationSoundSourceDir) {\n${includes}\n    }\n` +
      `    into trainerNotificationSoundTargetDir\n` +
      `    doFirst { trainerNotificationSoundTargetDir.mkdirs() }\n` +
      `    doLast {\n` +
      `        def missing = [${SOUND_FILES.map((fileName) => `'${fileName}'`).join(', ')}].findAll { !new File(trainerNotificationSoundTargetDir, it).exists() }\n` +
      `        if (!missing.isEmpty()) throw new GradleException("Trainer notification sounds were not copied: " + missing.join(', '))\n` +
      `    }\n` +
      `}\n` +
      `tasks.configureEach { task ->\n` +
      `    if (task.name == 'preBuild') task.dependsOn(copyTrainerNotificationSounds)\n` +
      `}\n` +
      `${GRADLE_END}\n`;

    config.modResults.contents = `${contents.trimEnd()}${block}`;
    return config;
  });
}

function withTrainerSoundFiles(config) {
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

      const keepXml = `<?xml version="1.0" encoding="utf-8"?>\n` +
        `<resources xmlns:tools="http://schemas.android.com/tools" tools:keep="@raw/tc_default,@raw/tc_battle,@raw/tc_social,@raw/tc_trade" />\n`;
      await fs.writeFile(path.join(rawDir, 'keep.xml'), keepXml, 'utf8');

      console.log('Trainer Collection notification sounds and shrinker keep rules written to Android res/raw.');
      return config;
    },
  ]);
}

module.exports = function withTrainerNotificationSounds(config) {
  return withTrainerSoundFiles(withTrainerSoundGradleHook(config));
};
