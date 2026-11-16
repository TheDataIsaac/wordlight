' Stops Wordlight on purpose: saves finish first and crash recovery does not start it again.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
dataDir = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Wordlight\data"
sh.CurrentDirectory = folder
sh.Environment("PROCESS")("WORDLIGHT_DATA_DIR") = dataDir
If MsgBox("Stop Wordlight? OBS and the projector stop updating until you start it again.", vbYesNo + vbQuestion, "Wordlight") = vbYes Then
  code = sh.Run("""" & folder & "\runtime\node.exe"" """ & folder & "\app\tools\launcher\start.mjs"" stop", 0, True)
  messageFile = dataDir & "\launcher-message.txt"
  text = "Done."
  If fso.FileExists(messageFile) Then text = fso.OpenTextFile(messageFile, 1, False, -2).ReadAll
  If code = 0 Then
    MsgBox text, vbInformation, "Wordlight"
  Else
    MsgBox text, vbExclamation, "Wordlight"
  End If
End If
