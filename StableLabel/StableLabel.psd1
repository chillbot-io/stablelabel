@{
    RootModule        = 'StableLabel.psm1'
    ModuleVersion     = '0.2.0'
    GUID              = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    Author            = 'StableLabel Contributors'
    CompanyName       = 'StableLabel'
    Copyright         = '(c) 2026 StableLabel Contributors. All rights reserved.'
    Description       = 'Sensitivity label management for Microsoft 365 - MIP and AIP labels, auto-labelling, bulk operations, and document protection.'
    PowerShellVersion = '7.0'
    # Note: Required modules are installed at runtime by Connect-SLAll rather than
    # declared here, so the module can load even before prerequisites are installed.
    RequiredModules   = @()
    FunctionsToExport = @(
        # Connection
        'Connect-SLGraph'
        'Connect-SLCompliance'
        'Connect-SLAll'
        'Connect-SLProtection'
        'Disconnect-SLGraph'
        'Disconnect-SLCompliance'
        'Disconnect-SLProtection'
        'Get-SLConnectionStatus'

        # Labels
        'Get-SLLabel'
        'Get-SLLabelPolicy'
        'New-SLLabelPolicy'
        'Set-SLLabelPolicy'
        'Remove-SLLabelPolicy'
        'Get-SLAutoLabelPolicy'
        'New-SLAutoLabelPolicy'
        'Set-SLAutoLabelPolicy'
        'Remove-SLAutoLabelPolicy'
        'Get-SLDocumentLabel'
        'Set-SLDocumentLabel'
        'Remove-SLDocumentLabel'
        'Set-SLDocumentLabelBulk'
        'Import-SLLabelCsv'
        'Remove-SLDocumentLabelBulk'

        # Protection (AIPService)
        'Get-SLProtectionConfig'

        # Analysis
        'Get-SLLabelReport'
        'Get-SLLabelMismatch'

        # Reporting
        'Get-SLAuditLog'

        # Snapshot
        'New-SLSnapshot'
        'Get-SLSnapshot'
        'Remove-SLSnapshot'
        'Compare-SLSnapshot'
        'Restore-SLSnapshot'
    )
    CmdletsToExport   = @()
    VariablesToExport  = @()
    AliasesToExport    = @()
    PrivateData        = @{
        PSData = @{
            Tags       = @('SensitivityLabels', 'MIP', 'AIP', 'InformationProtection', 'Microsoft365', 'AutoLabelling')
            ProjectUri = 'https://github.com/chillbot-io/stablelabel'
        }
    }
}
