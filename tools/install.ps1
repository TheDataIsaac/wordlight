# Installs Wordlight for this Windows user, or updates an installed copy. No administrator rights are needed.
#
#   From the internet, in PowerShell:
#     irm https://github.com/TheDataIsaac/wordlight/releases/latest/download/install.ps1 | iex
#   From an unzipped package: double-click "Install Wordlight.cmd" in it (it sets WORDLIGHT_FROM_FOLDER).
#
# It puts Wordlight in %LOCALAPPDATA%\Programs\Wordlight, adds Wordlight and Stop Wordlight to the Desktop and the
# Start menu, and starts it. Shows, songs and settings live in %LOCALAPPDATA%\Wordlight\data and are never touched.
# Files fetched here carry no "downloaded from the internet" mark, so Windows does not warn on every start; copies
# from a downloaded ZIP have that mark removed for the same reason.
#
# The whole script is one block so that "irm | iex" runs it in one go, and it never calls exit, which would close
# the PowerShell window someone pasted it into.
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'   # the progress bar makes downloads in Windows PowerShell 5.1 very slow

  # WORDLIGHT_RELEASE_URL points at another copy of the release files (used to test this script).
  $releaseUrl = if ($env:WORDLIGHT_RELEASE_URL) { $env:WORDLIGHT_RELEASE_URL.TrimEnd('/') } else { 'https://github.com/TheDataIsaac/wordlight/releases/latest/download' }
  $target = Join-Path $env:LOCALAPPDATA 'Programs\Wordlight'
  $dataDir = Join-Path $env:LOCALAPPDATA 'Wordlight\data'
  $previous = "$target.previous"
  $work = Join-Path ([IO.Path]::GetTempPath()) ('wordlight-install-' + [guid]::NewGuid().ToString('N'))

  function Say([string]$text) { Write-Host $text }

  # Downloads one release file, with a plain message when the internet or GitHub cannot be reached.
  function Get-ReleaseFile([string]$name, [string]$file) {
    try { Invoke-WebRequest -Uri "$releaseUrl/$name" -OutFile $file -UseBasicParsing }
    catch { throw "Could not download Wordlight. Check that this computer is connected to the internet, then try again. (Details: $($_.Exception.Message))" }
  }

  # Runs the package's own launcher (start or stop) with the usual data folder.
  function Invoke-Launcher([string]$folder, [string]$command) {
    $env:WORDLIGHT_DATA_DIR = $dataDir
    & (Join-Path $folder 'runtime\node.exe') (Join-Path $folder 'app\tools\launcher\start.mjs') $command 2>&1 | Out-Null
    return $LASTEXITCODE
  }

  function New-Shortcut([string]$file, [string]$targetPath, [string]$arguments, [string]$description) {
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut($file)
    $link.TargetPath = $targetPath
    $link.Arguments = $arguments
    $link.WorkingDirectory = $target
    $link.IconLocation = (Join-Path $target 'Wordlight.ico') + ',0'
    $link.Description = $description
    $link.Save()
  }

  try {
    Say ''
    Say 'Installing Wordlight...'
    New-Item -ItemType Directory -Path $work -Force | Out-Null

    if ($env:WORDLIGHT_FROM_FOLDER) {
      $source = (Resolve-Path $env:WORDLIGHT_FROM_FOLDER).Path.TrimEnd('\')
      if (-not (Test-Path (Join-Path $source 'runtime\node.exe')) -or -not (Test-Path (Join-Path $source 'app\server.mjs'))) {
        throw "This folder is not a complete Wordlight package: $source. Unzip the whole download first (right-click, Extract All), then run Install Wordlight again from the unzipped folder."
      }
    } else {
      # GitHub only accepts TLS 1.2 or newer; older Windows PowerShell does not offer it by default.
      [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
      Say 'Finding the newest version...'
      $sumsFile = Join-Path $work 'SHA256SUMS.txt'
      Get-ReleaseFile 'SHA256SUMS.txt' $sumsFile
      $line = Get-Content $sumsFile | Where-Object { $_ -match '^([0-9a-f]{64})\s+(Wordlight-portable-(\d+\.\d+\.\d+)-win-x64\.zip)$' } | Select-Object -First 1
      if (-not $line) { throw 'The release has no Windows package listed. Try again later.' }
      $null = $line -match '^([0-9a-f]{64})\s+(Wordlight-portable-(\d+\.\d+\.\d+)-win-x64\.zip)$'
      $expected = $Matches[1]; $zipName = $Matches[2]; $version = $Matches[3]
      $zip = Join-Path $work $zipName
      Say "Downloading Wordlight $version (about 55 MB)..."
      Get-ReleaseFile $zipName $zip
      # The checksum makes sure the download arrived whole and is the file the release lists.
      if ((Get-FileHash -Path $zip -Algorithm SHA256).Hash.ToLower() -ne $expected) { throw 'The download was damaged (its checksum does not match). Nothing was changed. Please try again.' }
      Say 'Unpacking...'
      Expand-Archive -Path $zip -DestinationPath (Join-Path $work 'unzipped') -Force
      $source = Join-Path $work 'unzipped\Wordlight'
    }

    if ($source -ne $target) {
      # An installed copy that is running is stopped first: its files cannot be replaced while it runs.
      if (Test-Path (Join-Path $target 'runtime\node.exe')) {
        Say 'Stopping the Wordlight that is running...'
        $null = Invoke-Launcher $target 'stop'
      }
      if (Test-Path $previous) { Remove-Item $previous -Recurse -Force }
      if (Test-Path $target) {
        try { Rename-Item $target $previous } catch { throw 'Wordlight is still open or a file in its folder is in use. Close Wordlight (and any window showing its folder), then run this again.' }
      }
      New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
      Copy-Item $source $target -Recurse
      # Updates downloaded inside the old copy are not carried over: the new one is already current.
    }
    # Remove the "downloaded from the internet" mark, so Windows does not ask before every start.
    Get-ChildItem $target -Recurse -File | Unblock-File

    # Shortcuts. VBScript starts Wordlight without a console window; where it is turned off, the .cmd files are used.
    $hasVbs = Test-Path (Join-Path $env:SystemRoot 'System32\vbscript.dll')
    $wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
    $startTarget = if ($hasVbs) { $wscript } else { Join-Path $target 'Other ways to start\Start Wordlight.cmd' }
    $startArgs = if ($hasVbs) { '"' + (Join-Path $target 'Start Wordlight.vbs') + '"' } else { '' }
    $stopTarget = if ($hasVbs) { $wscript } else { Join-Path $target 'Other ways to start\Stop Wordlight.cmd' }
    $stopArgs = if ($hasVbs) { '"' + (Join-Path $target 'Stop Wordlight.vbs') + '"' } else { '' }
    $desktop = [Environment]::GetFolderPath('Desktop')
    $menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Wordlight'
    # A test of this script puts the shortcuts in its own folder instead (with LOCALAPPDATA pointed at a test folder too).
    if ($env:WORDLIGHT_TEST_SHORTCUTS) { $desktop = Join-Path $env:WORDLIGHT_TEST_SHORTCUTS 'Desktop'; $menu = Join-Path $env:WORDLIGHT_TEST_SHORTCUTS 'Start menu\Wordlight'; New-Item -ItemType Directory -Path $desktop -Force | Out-Null }
    New-Item -ItemType Directory -Path $menu -Force | Out-Null
    foreach ($folder in @($desktop, $menu)) {
      New-Shortcut (Join-Path $folder 'Wordlight.lnk') $startTarget $startArgs 'Start Wordlight, or open it if it is already running'
      New-Shortcut (Join-Path $folder 'Stop Wordlight.lnk') $stopTarget $stopArgs 'Stop Wordlight (OBS and the projector stop updating)'
    }

    if (Test-Path $previous) { Remove-Item $previous -Recurse -Force -ErrorAction SilentlyContinue }
    $build = (Get-Content (Join-Path $target 'app\build.json') -Raw | ConvertFrom-Json).version

    Say ''
    Write-Host "Wordlight $build is installed." -ForegroundColor Green
    Say 'It is starting now. From now on, start it with "Wordlight" on the Desktop or in the Start menu.'
    if ($env:WORDLIGHT_FROM_FOLDER) { Say 'You can delete the downloaded ZIP and the unzipped folder: Wordlight no longer uses them.' }
    Say "Your shows and settings are kept in $dataDir"
    Say 'You can close this window.'
    Say ''
    if ($hasVbs) { Start-Process $wscript -ArgumentList $startArgs } else { Start-Process $startTarget }
  } catch {
    # Put the copy that was there before back, so a failed update never leaves a church without Wordlight.
    if ((Test-Path $previous) -and -not (Test-Path (Join-Path $target 'runtime\node.exe'))) {
      if (Test-Path $target) { Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue }
      Rename-Item $previous $target -ErrorAction SilentlyContinue
    }
    Write-Host ''
    Write-Host ('Wordlight was not installed: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'If this keeps happening, send a photo of this window to the person who gave you Wordlight.'
    Write-Host ''
  } finally {
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
  }
}
