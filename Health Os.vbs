Option Explicit
Dim shell, files, root, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
command = Chr(34) & root & "\runtime\node.exe" & Chr(34) & " " & Chr(34) & root & "\scripts\launch-health-os.mjs" & Chr(34)
shell.Run command, 0, False
