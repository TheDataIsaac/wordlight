' Starts Wordlight with crash recovery (or opens it if it is already running) without a console window.
' Before starting, the launcher installs an update that was downloaded from the studio, if there is one.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
dataDir = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Wordlight\data"
sh.CurrentDirectory = folder
sh.Environment("PROCESS")("WORDLIGHT_DATA_DIR") = dataDir
openWith = " --app-window"
If WScript.Arguments.Count > 0 Then
  If WScript.Arguments(0) = "--no-window" Then openWith = " --no-open"
End If
code = sh.Run("""" & folder & "\runtime\node.exe"" """ & folder & "\app\tools\launcher\start.mjs"" start" & openWith, 0, True)
If code <> 0 Then
  messageFile = dataDir & "\launcher-message.txt"
  text = "Wordlight could not start."
  If fso.FileExists(messageFile) Then text = fso.OpenTextFile(messageFile, 1, False, -2).ReadAll
  MsgBox text, vbExclamation, "Wordlight"
End If
