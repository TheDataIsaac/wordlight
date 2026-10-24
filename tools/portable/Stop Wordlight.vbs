' Stops Wordlight. Saves finish first; OBS outputs from Wordlight go blank until it is started again.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
If MsgBox("Stop Wordlight? OBS outputs from Wordlight go blank until you start it again.", vbYesNo + vbQuestion, "Wordlight") = vbYes Then
  code = sh.Run("""" & folder & "\runtime\node.exe"" """ & folder & "\launcher\launcher.mjs"" stop", 0, True)
  messageFile = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Wordlight\data\launcher-message.txt"
  text = "Done."
  If fso.FileExists(messageFile) Then text = fso.OpenTextFile(messageFile, 1, False, -2).ReadAll
  If code = 0 Then
    MsgBox text, vbInformation, "Wordlight"
  Else
    MsgBox text, vbExclamation, "Wordlight"
  End If
End If
