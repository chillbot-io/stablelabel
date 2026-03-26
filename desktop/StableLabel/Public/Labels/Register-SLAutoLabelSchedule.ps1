function Register-SLAutoLabelSchedule {
    <#
    .SYNOPSIS
        Registers a Windows Scheduled Task to run auto-label scans on a schedule.
    .DESCRIPTION
        Creates a Windows Scheduled Task that runs Invoke-SLAutoLabelScan
        on a recurring schedule. Designed for headless operation on Windows
        servers with E3 licensing.

        The task runs under the specified user account and uses stored
        credentials for Graph API authentication.
    .PARAMETER TaskName
        Name for the scheduled task (default: 'StableLabel-AutoLabel').
    .PARAMETER RuleFile
        Path to the JSON rule file containing scan parameters.
    .PARAMETER Schedule
        Cron-like schedule: 'Hourly', 'Daily', 'Weekly', or a specific time like '02:00'.
    .PARAMETER RunAsUser
        The user account to run the task under (default: current user).
    .PARAMETER DryRun
        Show the task XML without registering it.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Register-SLAutoLabelSchedule -RuleFile 'C:\StableLabel\rules\finance-rule.json' -Schedule 'Daily'
    .EXAMPLE
        Register-SLAutoLabelSchedule -TaskName 'SL-Finance-Scan' -RuleFile $rulePath -Schedule '02:00' -RunAsUser 'DOMAIN\svcaccount'
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [string]$TaskName = 'StableLabel-AutoLabel',

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$RuleFile,

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Schedule,

        [string]$RunAsUser,

        [switch]$DryRun,

        [switch]$AsJson
    )

    process {
        if ($PSVersionTable.PSVersion.Major -lt 7) {
            throw 'Register-SLAutoLabelSchedule requires PowerShell 7+.'
        }

        if (-not (Test-Path $RuleFile)) {
            throw "Rule file not found: $RuleFile"
        }

        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        # Build the PowerShell command that the scheduled task will execute
        $modulePath = $PSScriptRoot | Split-Path | Split-Path  # Go up from Public/Labels to module root
        $escapedModulePath = $modulePath.Replace("'", "''")
        $escapedRuleFile = $RuleFile.Replace("'", "''")

        $psCommand = @"
Import-Module '$escapedModulePath' -Force
`$rule = Get-Content -Path '$escapedRuleFile' -Raw | ConvertFrom-Json
Connect-SLGraph
Invoke-SLAutoLabelScan ``
    -SiteId `$rule.SiteId ``
    -DriveId `$rule.DriveId ``
    -FolderId `$rule.FolderId ``
    -LabelName `$rule.LabelName ``
    -Extensions `$rule.Extensions ``
    -MinSizeBytes `$rule.MinSizeBytes ``
    -MaxSizeBytes `$rule.MaxSizeBytes ``
    -FilenamePatterns `$rule.FilenamePatterns ``
    -ContentKeywords `$rule.ContentKeywords ``
    $(if (`$rule.Recursive) { '-Recursive' }) ``
    $(if (`$rule.SkipAlreadyLabeled) { '-SkipAlreadyLabeled' }) ``
    -AsJson | Out-File -FilePath (Join-Path `$env:LOCALAPPDATA 'StableLabel' 'logs' "scan-`$(Get-Date -Format 'yyyyMMdd-HHmmss').json")
"@

        # Build trigger based on schedule
        $triggerDescription = ''
        switch -Regex ($Schedule) {
            '^Hourly$' {
                $triggerDescription = 'Every hour'
            }
            '^Daily$' {
                $triggerDescription = 'Daily at midnight'
            }
            '^Weekly$' {
                $triggerDescription = 'Weekly on Monday at midnight'
            }
            '^\d{2}:\d{2}$' {
                $triggerDescription = "Daily at $Schedule"
            }
            default {
                throw "Invalid schedule: $Schedule. Use 'Hourly', 'Daily', 'Weekly', or a time like '02:00'."
            }
        }

        $taskInfo = [PSCustomObject]@{
            Action          = 'Register-SLAutoLabelSchedule'
            TaskName        = $TaskName
            RuleFile        = $RuleFile
            Schedule        = $Schedule
            TriggerDescription = $triggerDescription
            RunAsUser       = $RunAsUser ?? $env:USERNAME
            Command         = "pwsh -NoProfile -NonInteractive -Command `"$($psCommand.Substring(0, [Math]::Min(200, $psCommand.Length)))...`""
            DryRun          = [bool]$isDryRun
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Register-SLAutoLabelSchedule' -Target $TaskName -Detail @{ RuleFile = $RuleFile; Schedule = $Schedule } -Result 'dry-run'
            $taskInfo | Add-Member -NotePropertyName 'FullCommand' -NotePropertyValue $psCommand
            if ($AsJson) { return $taskInfo | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth }
            return $taskInfo
        }

        if (-not $PSCmdlet.ShouldProcess($TaskName, 'Register scheduled task')) {
            return
        }

        try {
            # Create the scheduled task using ScheduledTasks module
            $action = New-ScheduledTaskAction -Execute 'pwsh.exe' -Argument "-NoProfile -NonInteractive -File -" -WorkingDirectory $modulePath

            $trigger = switch -Regex ($Schedule) {
                '^Hourly$'      { New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1) }
                '^Daily$'       { New-ScheduledTaskTrigger -Daily -At '00:00' }
                '^Weekly$'      { New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At '00:00' }
                '^\d{2}:\d{2}$' { New-ScheduledTaskTrigger -Daily -At $Schedule }
            }

            $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

            $taskParams = @{
                TaskName    = $TaskName
                TaskPath    = '\StableLabel\'
                Action      = $action
                Trigger     = $trigger
                Settings    = $settings
                Description = "StableLabel auto-labeling scan using rule: $RuleFile"
            }

            if ($RunAsUser) {
                $taskParams['User'] = $RunAsUser
            }

            Register-ScheduledTask @taskParams -Force

            $taskInfo | Add-Member -NotePropertyName 'Registered' -NotePropertyValue $true

            Write-SLAuditEntry -Action 'Register-SLAutoLabelSchedule' -Target $TaskName -Detail @{ RuleFile = $RuleFile; Schedule = $Schedule } -Result 'success'

            if ($AsJson) { return $taskInfo | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth }
            return $taskInfo
        }
        catch {
            Write-SLAuditEntry -Action 'Register-SLAutoLabelSchedule' -Target $TaskName -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
