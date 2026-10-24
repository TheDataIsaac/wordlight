' Starts Wordlight (or opens it if it is already running) without a console window.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
args = ""
If WScript.Arguments.Count > 0 Then args = " " & WScript.Arguments(0)
code = sh.Run("""" & folder & "\runtime\node.exe"" """ & folder & "\launcher\launcher.mjs"" start" & args, 0, True)
If code <> 0 Then
  messageFile = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Wordlight\data\launcher-message.txt"
  text = "Wordlight could not start."
  If fso.FileExists(messageFile) Then text = fso.OpenTextFile(messageFile, 1, False, -2).ReadAll
  MsgBox text, vbExclamation, "Wordlight"
End If
