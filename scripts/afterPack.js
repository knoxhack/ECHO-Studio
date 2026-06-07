/**
 * afterPack hook — embeds the application icon into the Electron .exe
 * using resedit (pure Node.js), bypassing the need for winCodeSign / signtool.
 *
 * This is the same approach used by ECHO Launcher.
 */
const fs = require('fs')
const path = require('path')
const resedit = require('resedit')

module.exports = async function (context) {
  // Only run for Windows builds
  if (context.electronPlatformName !== 'win32') return

  const exePath = path.join(context.appOutDir, 'ECHO Addon Studio.exe')
  if (!fs.existsSync(exePath)) {
    console.warn('[afterPack] Executable not found:', exePath)
    return
  }

  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico')
  if (!fs.existsSync(iconPath)) {
    console.warn('[afterPack] Icon not found:', iconPath)
    return
  }

  console.log('[afterPack] Embedding icon into', exePath)

  // Read the existing executable
  const data = fs.readFileSync(exePath)
  const exe = resedit.NtExecutable.from(data)
  const res = resedit.NtExecutableResource.from(exe)

  // Load the icon file
  const iconFile = resedit.Data.IconFile.from(fs.readFileSync(iconPath))

  // Replace the icon group in the resource section
  resedit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    1, // icon group ID (RT_GROUP_ICON = 14)
    1033, // language ID (English US)
    iconFile.icons.map((item) => item.data)
  )

  // Write back
  res.outputResource(exe)
  const out = exe.generate()
  fs.writeFileSync(exePath, Buffer.from(out))

  console.log('[afterPack] Icon embedded successfully')
}
