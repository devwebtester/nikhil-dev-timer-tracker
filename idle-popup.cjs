
// 'use strict';

// const { spawn } = require('node:child_process');

// const countdownSeconds = Math.max(
//   1,
//   Math.min(3600, Number(process.argv[2]) || 10)
// );

// const psScript = String.raw`
// $ErrorActionPreference = 'Stop'

// try {
//     Add-Type -AssemblyName System.Windows.Forms
//     Add-Type -AssemblyName System.Drawing

//     $form = New-Object System.Windows.Forms.Form
//     $form.Text = 'WorkMonitor - Are You Working?'
//     $form.Size = New-Object System.Drawing.Size(440, 300)
//     $form.StartPosition = 'CenterScreen'
//     $form.TopMost = $true
//     $form.FormBorderStyle = 'FixedDialog'
//     $form.MaximizeBox = $false
//     $form.MinimizeBox = $false
//     $form.ShowInTaskbar = $true
//     $form.BackColor = [System.Drawing.Color]::White

//     $title = New-Object System.Windows.Forms.Label
//     $title.Text = 'Are you still working?'
//     $title.Font = New-Object System.Drawing.Font(
//         'Segoe UI', 16, [System.Drawing.FontStyle]::Bold
//     )
//     $title.Location = New-Object System.Drawing.Point(25, 20)
//     $title.Size = New-Object System.Drawing.Size(370, 35)
//     $form.Controls.Add($title)

//     $message = New-Object System.Windows.Forms.Label
//     $message.Text = 'No mouse or keyboard activity was detected.'
//     $message.Font = New-Object System.Drawing.Font('Segoe UI', 10)
//     $message.Location = New-Object System.Drawing.Point(25, 65)
//     $message.Size = New-Object System.Drawing.Size(380, 30)
//     $form.Controls.Add($message)

//     $countdownLabel = New-Object System.Windows.Forms.Label
//     $countdownLabel.Font = New-Object System.Drawing.Font(
//         'Segoe UI', 28, [System.Drawing.FontStyle]::Bold
//     )
//     $countdownLabel.ForeColor = [System.Drawing.Color]::SeaGreen
//     $countdownLabel.TextAlign = 'MiddleCenter'
//     $countdownLabel.Location = New-Object System.Drawing.Point(120, 100)
//     $countdownLabel.Size = New-Object System.Drawing.Size(180, 55)
//     $form.Controls.Add($countdownLabel)

//     $workingButton = New-Object System.Windows.Forms.Button
//     $workingButton.Text = 'Working'
//     $workingButton.Location = New-Object System.Drawing.Point(65, 190)
//     $workingButton.Size = New-Object System.Drawing.Size(135, 42)
//     $workingButton.BackColor = [System.Drawing.Color]::FromArgb(22, 163, 74)
//     $workingButton.ForeColor = [System.Drawing.Color]::White
//     $workingButton.FlatStyle = 'Flat'
//     $form.Controls.Add($workingButton)

//     $notWorkingButton = New-Object System.Windows.Forms.Button
//     $notWorkingButton.Text = 'Not Working'
//     $notWorkingButton.Location = New-Object System.Drawing.Point(225, 190)
//     $notWorkingButton.Size = New-Object System.Drawing.Size(135, 42)
//     $notWorkingButton.BackColor = [System.Drawing.Color]::FromArgb(220, 38, 38)
//     $notWorkingButton.ForeColor = [System.Drawing.Color]::White
//     $notWorkingButton.FlatStyle = 'Flat'
//     $form.Controls.Add($notWorkingButton)

//     $script:remaining = __COUNTDOWN__
//     $script:finished = $false
//     $script:popupResult = ''

//     $timer = New-Object System.Windows.Forms.Timer
//     $timer.Interval = 1000

//     function Finish-Popup([string]$choice) {
//         if ($script:finished) {
//             return
//         }

//         $script:finished = $true
//         $script:popupResult = $choice
//         $timer.Stop()
//         $form.Close()
//     }

//     $workingButton.Add_Click({
//         Finish-Popup 'WORKING'
//     })

//     $notWorkingButton.Add_Click({
//         Finish-Popup 'NOT_WORKING'
//     })

//     $timer.Add_Tick({
//         $script:remaining--

//         if ($script:remaining -le 0) {
//             Finish-Popup 'TIMEOUT'
//             return
//         }

//         $countdownLabel.Text = [string]$script:remaining
//     })

//     $countdownLabel.Text = [string]$script:remaining

//     $form.Add_Shown({
//         $form.Activate()
//         $workingButton.Focus()
//         $timer.Start()
//     })

//     [void]$form.ShowDialog()
//     $timer.Stop()
//     $timer.Dispose()
//     $form.Dispose()

//     if ([string]::IsNullOrWhiteSpace($script:popupResult)) {
//         $script:popupResult = 'TIMEOUT'
//     }

//     # Emit a single machine-readable result for the Node.js wrapper.
//     [Console]::Out.WriteLine("IDLE_RESULT:$($script:popupResult)")
//     [Console]::Out.Flush()
// }
// catch {
//     [Console]::Error.WriteLine($_.ToString())
//     exit 1
// }
// `;

// const safeScript = psScript.replace(
//   '__COUNTDOWN__',
//   String(countdownSeconds)
// );

// const encodedScript = Buffer.from(
//   safeScript,
//   'utf16le'
// ).toString('base64');

// const child = spawn(
//   'powershell.exe',
//   [
//     '-NoLogo',
//     '-NoProfile',
//     '-NonInteractive',
//     '-STA',
//     '-ExecutionPolicy',
//     'Bypass',
//     '-EncodedCommand',
//     encodedScript,
//   ],
//   {
//     windowsHide: false,
//     stdio: ['ignore', 'pipe', 'pipe'],
//   }
// );

// let output = '';
// let errors = '';
// let resultForwarded = false;

// child.stdout.setEncoding('utf8');
// child.stderr.setEncoding('utf8');

// child.stdout.on('data', (chunk) => {
//   output += chunk;
// });

// child.stderr.on('data', (chunk) => {
//   errors += chunk;
// });

// child.on('error', (error) => {
//   console.error('[IDLE POPUP] Could not open Windows popup:', error.message);
//   process.exitCode = 1;
// });

// child.on('close', (code) => {
//   const match = output.match(
//     /IDLE_RESULT:(WORKING|NOT_WORKING|TIMEOUT)/
//   );

//   if (match) {
//     resultForwarded = true;
//     process.stdout.write(`${match[0]}\n`);
//     return;
//   }

//   console.error('[IDLE POPUP] PowerShell exit code:', code);
//   console.error('[IDLE POPUP] stdout:', JSON.stringify(output));
//   console.error('[IDLE POPUP] stderr:', errors.trim());

//   // Never silently convert a popup launch failure into a user choice.
//   process.exitCode = 1;
// });




















'use strict';

const { spawn } = require('node:child_process');

const countdownSeconds = Math.max(1, Math.min(3600, Number(process.argv[2]) || 10));

// Windows Forms popup. Plays a repeating emergency-style warning tone for about 4 seconds.
const psScript = String.raw`
$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'WorkMonitor - Idle Activity Warning'
    $form.ClientSize = New-Object System.Drawing.Size(520, 355)
    $form.StartPosition = 'CenterScreen'
    $form.TopMost = $true
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.ShowInTaskbar = $true
    $form.BackColor = [System.Drawing.Color]::FromArgb(245, 247, 250)
    $form.Font = New-Object System.Drawing.Font('Segoe UI', 10)

    # Warning header
    $header = New-Object System.Windows.Forms.Panel
    $header.Location = New-Object System.Drawing.Point(0, 0)
    $header.Size = New-Object System.Drawing.Size(520, 82)
    $header.BackColor = [System.Drawing.Color]::FromArgb(153, 27, 27)
    $form.Controls.Add($header)

    $warningIcon = New-Object System.Windows.Forms.Label
    $warningIcon.Text = '!'
    $warningIcon.Font = New-Object System.Drawing.Font('Segoe UI', 24, [System.Drawing.FontStyle]::Bold)
    $warningIcon.ForeColor = [System.Drawing.Color]::FromArgb(153, 27, 27)
    $warningIcon.BackColor = [System.Drawing.Color]::FromArgb(255, 255, 255)
    $warningIcon.TextAlign = 'MiddleCenter'
    $warningIcon.Location = New-Object System.Drawing.Point(24, 17)
    $warningIcon.Size = New-Object System.Drawing.Size(46, 46)
    $header.Controls.Add($warningIcon)

    $headerTitle = New-Object System.Windows.Forms.Label
    $headerTitle.Text = 'IDLE ACTIVITY WARNING'
    $headerTitle.Font = New-Object System.Drawing.Font('Segoe UI', 15, [System.Drawing.FontStyle]::Bold)
    $headerTitle.ForeColor = [System.Drawing.Color]::White
    $headerTitle.Location = New-Object System.Drawing.Point(86, 14)
    $headerTitle.Size = New-Object System.Drawing.Size(405, 30)
    $header.Controls.Add($headerTitle)

    $headerSub = New-Object System.Windows.Forms.Label
    $headerSub.Text = 'Please confirm your current work status'
    $headerSub.Font = New-Object System.Drawing.Font('Segoe UI', 9)
    $headerSub.ForeColor = [System.Drawing.Color]::FromArgb(255, 230, 230)
    $headerSub.Location = New-Object System.Drawing.Point(87, 44)
    $headerSub.Size = New-Object System.Drawing.Size(405, 22)
    $header.Controls.Add($headerSub)

    $message = New-Object System.Windows.Forms.Label
    $message.Text = 'No mouse or keyboard activity has been detected. Are you still working?'
    $message.Font = New-Object System.Drawing.Font('Segoe UI', 10)
    $message.ForeColor = [System.Drawing.Color]::FromArgb(55, 65, 81)
    $message.TextAlign = 'MiddleCenter'
    $message.Location = New-Object System.Drawing.Point(28, 98)
    $message.Size = New-Object System.Drawing.Size(464, 42)
    $form.Controls.Add($message)

    $countdownCaption = New-Object System.Windows.Forms.Label
    $countdownCaption.Text = 'Tracking will pause if you do not respond in'
    $countdownCaption.Font = New-Object System.Drawing.Font('Segoe UI', 9)
    $countdownCaption.ForeColor = [System.Drawing.Color]::FromArgb(107, 114, 128)
    $countdownCaption.TextAlign = 'MiddleCenter'
    $countdownCaption.Location = New-Object System.Drawing.Point(28, 143)
    $countdownCaption.Size = New-Object System.Drawing.Size(464, 24)
    $form.Controls.Add($countdownCaption)

    $countdownPanel = New-Object System.Windows.Forms.Panel
    $countdownPanel.Location = New-Object System.Drawing.Point(195, 170)
    $countdownPanel.Size = New-Object System.Drawing.Size(130, 62)
    $countdownPanel.BackColor = [System.Drawing.Color]::White
    $form.Controls.Add($countdownPanel)

    $countdownLabel = New-Object System.Windows.Forms.Label
    $countdownLabel.Font = New-Object System.Drawing.Font('Segoe UI', 27, [System.Drawing.FontStyle]::Bold)
    $countdownLabel.ForeColor = [System.Drawing.Color]::FromArgb(185, 28, 28)
    $countdownLabel.TextAlign = 'MiddleCenter'
    $countdownLabel.Dock = 'Fill'
    $countdownPanel.Controls.Add($countdownLabel)

    $workingButton = New-Object System.Windows.Forms.Button
    $workingButton.Text = "I'm Working"
    $workingButton.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
    $workingButton.Location = New-Object System.Drawing.Point(48, 258)
    $workingButton.Size = New-Object System.Drawing.Size(200, 48)
    $workingButton.BackColor = [System.Drawing.Color]::FromArgb(22, 163, 74)
    $workingButton.ForeColor = [System.Drawing.Color]::White
    $workingButton.FlatStyle = 'Flat'
    $workingButton.FlatAppearance.BorderSize = 0
    $workingButton.Cursor = [System.Windows.Forms.Cursors]::Hand
    $form.Controls.Add($workingButton)

    $notWorkingButton = New-Object System.Windows.Forms.Button
    $notWorkingButton.Text = 'Not Working'
    $notWorkingButton.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
    $notWorkingButton.Location = New-Object System.Drawing.Point(272, 258)
    $notWorkingButton.Size = New-Object System.Drawing.Size(200, 48)
    $notWorkingButton.BackColor = [System.Drawing.Color]::FromArgb(185, 28, 28)
    $notWorkingButton.ForeColor = [System.Drawing.Color]::White
    $notWorkingButton.FlatStyle = 'Flat'
    $notWorkingButton.FlatAppearance.BorderSize = 0
    $notWorkingButton.Cursor = [System.Windows.Forms.Cursors]::Hand
    $form.Controls.Add($notWorkingButton)

    $footer = New-Object System.Windows.Forms.Label
    $footer.Text = 'Choose an option before the countdown reaches zero.'
    $footer.Font = New-Object System.Drawing.Font('Segoe UI', 8)
    $footer.ForeColor = [System.Drawing.Color]::FromArgb(107, 114, 128)
    $footer.TextAlign = 'MiddleCenter'
    $footer.Location = New-Object System.Drawing.Point(25, 317)
    $footer.Size = New-Object System.Drawing.Size(470, 22)
    $form.Controls.Add($footer)

    $script:remaining = __COUNTDOWN__
    $script:finished = $false
    $script:popupResult = ''
    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 1000

    function Finish-Popup([string]$choice) {
        if ($script:finished) { return }
        $script:finished = $true
        $script:popupResult = $choice
        $timer.Stop()
        $form.Close()
    }

    $workingButton.Add_Click({ Finish-Popup 'WORKING' })
    $notWorkingButton.Add_Click({ Finish-Popup 'NOT_WORKING' })
    $timer.Add_Tick({
        $script:remaining--
        if ($script:remaining -le 0) {
            $countdownLabel.Text = '0'
            Finish-Popup 'TIMEOUT'
            return
        }
        $countdownLabel.Text = [string]$script:remaining
        if ($script:remaining -le 5) {
            $countdownLabel.ForeColor = [System.Drawing.Color]::FromArgb(153, 27, 27)
        }
    })

    $countdownLabel.Text = [string]$script:remaining
    $form.Add_Shown({
        $form.Activate()
        $form.BringToFront()
        $workingButton.Focus()

        # Run a multi-tone warning sequence in the background so the popup UI
        # stays responsive. Total tone time is about 3.6-4 seconds.
        try {
            $null = [System.Threading.Tasks.Task]::Run([Action]{
                try {
                    [Console]::Beep(1250, 550)
                    Start-Sleep -Milliseconds 100
                    [Console]::Beep(900, 550)
                    Start-Sleep -Milliseconds 100
                    [Console]::Beep(1250, 550)
                    Start-Sleep -Milliseconds 100
                    [Console]::Beep(900, 550)
                    Start-Sleep -Milliseconds 100
                    [Console]::Beep(1250, 550)
                    Start-Sleep -Milliseconds 100
                    [Console]::Beep(900, 550)
                } catch {
                    # Fallback to repeated Windows warning sounds if Console.Beep is unavailable.
                    try {
                        1..5 | ForEach-Object {
                            [System.Media.SystemSounds]::Hand.Play()
                            Start-Sleep -Milliseconds 650
                        }
                    } catch {}
                }
            })
        } catch {
            try {
                1..5 | ForEach-Object {
                    [System.Media.SystemSounds]::Hand.Play()
                    Start-Sleep -Milliseconds 650
                }
            } catch {}
        }
        $timer.Start()
    })

    [void]$form.ShowDialog()
    $timer.Stop()
    $timer.Dispose()
    $form.Dispose()
    if ([string]::IsNullOrWhiteSpace($script:popupResult)) { $script:popupResult = 'TIMEOUT' }
    [Console]::Out.WriteLine("IDLE_RESULT:$($script:popupResult)")
    [Console]::Out.Flush()
}
catch {
    [Console]::Error.WriteLine($_.ToString())
    exit 1
}
`;

const safeScript = psScript.replace('__COUNTDOWN__', String(countdownSeconds));
const encodedScript = Buffer.from(safeScript, 'utf16le').toString('base64');
const child = spawn('powershell.exe', [
  '-NoLogo', '-NoProfile', '-NonInteractive', '-STA',
  '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedScript,
], { windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] });

let output = '';
let errors = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { errors += chunk; });
child.on('error', error => {
  console.error('[IDLE POPUP] Could not open Windows popup:', error.message);
  process.exitCode = 1;
});
child.on('close', code => {
  const match = output.match(/IDLE_RESULT:(WORKING|NOT_WORKING|TIMEOUT)/);
  if (match) {
    process.stdout.write(`${match[0]}\n`);
    return;
  }
  console.error('[IDLE POPUP] PowerShell exit code:', code);
  console.error('[IDLE POPUP] stdout:', JSON.stringify(output));
  console.error('[IDLE POPUP] stderr:', errors.trim());
  process.exitCode = 1;
});

