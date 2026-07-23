const minimumVersion = [22, 13, 0];
const currentVersion = process.versions.node.split('.').map((part) => Number(part));

function compareVersions(current, minimum) {
  for (let index = 0; index < minimum.length; index += 1) {
    const currentPart = current[index] ?? 0;
    const minimumPart = minimum[index] ?? 0;

    if (currentPart > minimumPart) {
      return 1;
    }

    if (currentPart < minimumPart) {
      return -1;
    }
  }

  return 0;
}

if (compareVersions(currentVersion, minimumVersion) < 0) {
  const required = minimumVersion.join('.');

  console.error(
    [
      `This project requires Node.js ${required} or newer.`,
      `Current version: ${process.versions.node}`,
      '',
      'Why:',
      "- the backend uses Node's built-in `node:sqlite` module",
      '- the frontend uses a Vite version that expects a newer Node runtime',
      '',
      'After upgrading Node, run `npm install` and then `npm run dev`.',
    ].join('\n')
  );

  process.exit(1);
}
