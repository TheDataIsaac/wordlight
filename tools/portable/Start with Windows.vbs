' Adds or removes a Startup shortcut that starts Wordlight in the background when you sign in to Windows.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
link = sh.SpecialFolders("Startup") & "\Wordlight.lnk"
If fso.FileExists(link) Then
  If MsgBox("Wordlight starts with Windows. Turn this off?", vbYesNo + vbQuestion, "Wordlight") = vbYes Then
    fso.DeleteFile link
    MsgBox "Wordlight will no longer start with Windows.", vbInformation, "Wordlight"
  End If
Else
  If MsgBox("Start Wordlight in the background when you sign in to Windows?", vbYesNo + vbQuestion, "Wordlight") = vbYes Then
    Set s = sh.CreateShortcut(link)
    s.TargetPath = sh.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\wscript.exe"
    s.Arguments = """" & folder & "\Start Wordlight.vbs"" --no-window"
    s.WorkingDirectory = folder
    s.Save
    MsgBox "Wordlight will start with Windows. Run this again to turn it off.", vbInformation, "Wordlight"
  End If
End If
