function New-SLRetentionPolicy {
    <#
    .SYNOPSIS
        Creates a new retention policy in Security & Compliance Center.
    .DESCRIPTION
        Wraps the New-RetentionCompliancePolicy cmdlet via Invoke-SLComplianceCommand.
        Creates a retention policy with the specified name and optional location scoping.
    .PARAMETER Name
        The name of the new retention policy.
    .PARAMETER Comment
        An optional comment describing the policy.
    .PARAMETER Enabled
        Whether the policy is enabled. Defaults to $true.
    .PARAMETER ExchangeLocation
        Exchange locations to include in the policy.
    .PARAMETER SharePointLocation
        SharePoint locations to include in the policy.
    .PARAMETER OneDriveLocation
        OneDrive locations to include in the policy.
    .PARAMETER ModernGroupLocation
        Microsoft 365 Group locations to include in the policy.
    .PARAMETER SkypeLocation
        Skype for Business locations to include in the policy.
    .PARAMETER PublicFolderLocation
        Public folder locations to include in the policy.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        New-SLRetentionPolicy -Name 'Exchange Retention' -ExchangeLocation 'All'
    .EXAMPLE
        New-SLRetentionPolicy -Name 'SharePoint Retention' -SharePointLocation 'All' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Name,

        [string]$Comment,

        [bool]$Enabled = $true,

        [string[]]$ExchangeLocation,

        [string[]]$SharePointLocation,

        [string[]]$OneDriveLocation,

        [string[]]$ModernGroupLocation,

        [string[]]$SkypeLocation,

        [string[]]$PublicFolderLocation,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $detail = @{
            Comment              = $Comment
            Enabled              = $Enabled
            ExchangeLocation     = $ExchangeLocation
            SharePointLocation   = $SharePointLocation
            OneDriveLocation     = $OneDriveLocation
            ModernGroupLocation  = $ModernGroupLocation
            SkypeLocation        = $SkypeLocation
            PublicFolderLocation = $PublicFolderLocation
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'New-RetentionCompliancePolicy' -Target $Name -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action               = 'New-RetentionCompliancePolicy'
                Name                 = $Name
                Comment              = $Comment
                Enabled              = $Enabled
                ExchangeLocation     = $ExchangeLocation
                SharePointLocation   = $SharePointLocation
                OneDriveLocation     = $OneDriveLocation
                ModernGroupLocation  = $ModernGroupLocation
                SkypeLocation        = $SkypeLocation
                PublicFolderLocation = $PublicFolderLocation
            }
            return Format-SLDryRunResult -Result $dryRunResult -AsJson:$AsJson
        }

        if (-not $PSCmdlet.ShouldProcess($Name, 'Create retention policy')) {
            return
        }

        try {
            Write-Verbose "Creating retention policy: $Name"

            $params = @{
                Name    = $Name
                Enabled = $Enabled
            }
            if ($Comment)              { $params['Comment']              = $Comment }
            if ($ExchangeLocation)     { $params['ExchangeLocation']     = $ExchangeLocation }
            if ($SharePointLocation)   { $params['SharePointLocation']   = $SharePointLocation }
            if ($OneDriveLocation)     { $params['OneDriveLocation']     = $OneDriveLocation }
            if ($ModernGroupLocation)  { $params['ModernGroupLocation']  = $ModernGroupLocation }
            if ($SkypeLocation)        { $params['SkypeLocation']        = $SkypeLocation }
            if ($PublicFolderLocation) { $params['PublicFolderLocation'] = $PublicFolderLocation }

            $result = Invoke-SLComplianceCommand -OperationName "New-RetentionCompliancePolicy '$Name'" -ScriptBlock {
                New-RetentionCompliancePolicy @params
            }

            Write-SLAuditEntry -Action 'New-RetentionCompliancePolicy' -Target $Name -Detail $detail -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'New-RetentionCompliancePolicy' -Target $Name -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
