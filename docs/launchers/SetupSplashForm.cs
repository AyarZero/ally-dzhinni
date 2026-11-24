using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace AllYLaunchers
{
    internal sealed class SetupSplashForm : Form
    {
        private const int WM_NCLBUTTONDOWN = 0xA1;
        private const int HTCAPTION = 0x2;
        private const int CS_DROPSHADOW = 0x00020000;
        private const int DWMWA_WINDOW_CORNER_PREFERENCE = 33;
        private const int DWMWCP_ROUND = 2;

        [DllImport("user32.dll")] private static extern bool ReleaseCapture();
        [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);
        [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

        private readonly bool _splashOnly;
        private readonly Timer _animTimer;
        private readonly List<string> _logLines = new List<string>();
        private readonly Panel _logPanel;
        private readonly TextBox _logBox;
        private readonly LinkLabel _logToggle;
        private readonly Button _retryBtn;
        private readonly Button _copyLogBtn;
        private readonly Button _closeBtn;

        private string _stageTitle;
        private string _stageDetail;
        private float _displayProgress;
        private float _targetProgress;
        private float _creepCap;
        private float _phase;
        private bool _isSuccess;
        private bool _isError;
        private bool _isRunning;
        private bool _fadingOut;
        private bool _logExpanded;
        private bool _closeHovered;
        private Rectangle _closeHitRect;

        public event EventHandler RetryRequested;
        public event EventHandler CancelRequested;

        public SetupSplashForm(bool splashOnly) {
            _splashOnly = splashOnly;
            _isRunning = true;
            _stageTitle = splashOnly ? "Запускаю AllY…" : "Готовлю AllY к первому запуску…";
            _stageDetail = splashOnly ? "Открываю рабочее окно" : "Проверяю окружение и собираю компоненты";
            _displayProgress = splashOnly ? 0f : 3f;
            _targetProgress = splashOnly ? 0f : 8f;
            _creepCap = splashOnly ? 0f : 14f;

            AutoScaleMode = AutoScaleMode.None;
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(17, 19, 22);
            ForeColor = Color.FromArgb(236, 232, 224);
            ClientSize = splashOnly ? new Size(440, 256) : new Size(540, 368);
            Opacity = 0.0;
            DoubleBuffered = true;
            Text = "AllY · Джинни";
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);

            try {
                Icon exeIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                if (exeIcon != null) Icon = exeIcon;
            } catch { }

            _closeHitRect = new Rectangle(ClientSize.Width - 42, 12, 28, 28);

            _logToggle = new LinkLabel();
            _logToggle.AutoSize = true;
            _logToggle.TabStop = false;
            _logToggle.Text = "▸ Подробности";
            _logToggle.LinkColor = Color.FromArgb(148, 157, 170);
            _logToggle.ActiveLinkColor = Color.FromArgb(212, 138, 108);
            _logToggle.VisitedLinkColor = _logToggle.LinkColor;
            _logToggle.LinkBehavior = LinkBehavior.HoverUnderline;
            _logToggle.BackColor = BackColor;
            _logToggle.Font = new Font("Segoe UI", 12.5f, FontStyle.Regular, GraphicsUnit.Pixel);
            _logToggle.Location = new Point(58, 326);
            _logToggle.Visible = !splashOnly;
            _logToggle.Click += OnToggleLogClicked;
            Controls.Add(_logToggle);

            _retryBtn = MakeActionButton("Повторить", true);
            _retryBtn.Location = new Point(220, 319);
            _retryBtn.Click += delegate { if (RetryRequested != null) RetryRequested(this, EventArgs.Empty); };
            Controls.Add(_retryBtn);

            _copyLogBtn = MakeActionButton("Копировать лог", false);
            _copyLogBtn.Width = 118;
            _copyLogBtn.Location = new Point(316, 319);
            _copyLogBtn.Click += OnCopyLogClicked;
            Controls.Add(_copyLogBtn);

            _closeBtn = MakeActionButton("Закрыть", false);
            _closeBtn.Width = 78;
            _closeBtn.Location = new Point(442, 319);
            _closeBtn.Click += delegate { HandleCloseClick(); };
            Controls.Add(_closeBtn);

            _logPanel = new Panel {
                Location = new Point(28, 362),
                Size = new Size(484, 140),
                BackColor = Color.FromArgb(38, 43, 52),
                Padding = new Padding(1),
                Visible = false
            };

            _logBox = new TextBox {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                Dock = DockStyle.Fill,
                BorderStyle = BorderStyle.None,
                BackColor = Color.FromArgb(12, 14, 17),
                ForeColor = Color.FromArgb(174, 183, 196),
                Font = new Font("Consolas", 11.5f, FontStyle.Regular, GraphicsUnit.Pixel)
            };
            _logPanel.Controls.Add(_logBox);
            Controls.Add(_logPanel);

            _animTimer = new Timer { Interval = 16 };
            _animTimer.Tick += OnAnimationTick;
            _animTimer.Start();
        }

        protected override CreateParams CreateParams {
            get {
                CreateParams cp = base.CreateParams;
                cp.ClassStyle |= CS_DROPSHADOW;
                return cp;
            }
        }

        protected override void OnHandleCreated(EventArgs e) {
            base.OnHandleCreated(e);
            try {
                int pref = DWMWCP_ROUND;
                DwmSetWindowAttribute(Handle, DWMWA_WINDOW_CORNER_PREFERENCE, ref pref, sizeof(int));
            } catch { }
        }

        protected override void Dispose(bool disposing) {
            if (disposing && _animTimer != null) {
                _animTimer.Stop();
                _animTimer.Dispose();
            }
            base.Dispose(disposing);
        }

        protected override void OnMouseDown(MouseEventArgs e) {
            base.OnMouseDown(e);
            if (e.Button != MouseButtons.Left) return;
            if (_closeHitRect.Contains(e.Location)) {
                HandleCloseClick();
                return;
            }
            ReleaseCapture();
            SendMessage(Handle, WM_NCLBUTTONDOWN, HTCAPTION, 0);
        }

        protected override void OnMouseMove(MouseEventArgs e) {
            base.OnMouseMove(e);
            bool hovered = _closeHitRect.Contains(e.Location);
            if (hovered != _closeHovered) {
                _closeHovered = hovered;
                Cursor = hovered ? Cursors.Hand : Cursors.Default;
                Invalidate(_closeHitRect);
            }
        }

        protected override void OnMouseLeave(EventArgs e) {
            base.OnMouseLeave(e);
            if (_closeHovered) {
                _closeHovered = false;
                Cursor = Cursors.Default;
                Invalidate(_closeHitRect);
            }
        }

        public void ResetForRetry() {
            InvokeUi(delegate {
                _isError = false;
                _isSuccess = false;
                _isRunning = true;
                _fadingOut = false;
                _displayProgress = 3f;
                _targetProgress = 8f;
                _creepCap = 14f;
                _stageTitle = "Повторяю установку AllY…";
                _stageDetail = "Запускаю проверку и сборку заново";
                _retryBtn.Visible = false;
                _copyLogBtn.Visible = false;
                _closeBtn.Visible = false;
                _logLines.Clear();
                _logBox.Clear();
                Invalidate();
            });
        }

        public void SetStage(string title, string detail, float targetPercent, float autoCreepCap) {
            InvokeUi(delegate {
                if (_isError || _isSuccess) return;
                if (!string.IsNullOrEmpty(title)) _stageTitle = title;
                if (detail != null) _stageDetail = detail;
                if (targetPercent > _targetProgress) _targetProgress = Math.Min(99f, targetPercent);
                if (autoCreepCap > _creepCap) _creepCap = Math.Min(98f, autoCreepCap);
            });
        }

        public void AppendLog(string line) {
            if (string.IsNullOrWhiteSpace(line)) return;
            InvokeUi(delegate {
                if (_logLines.Count >= 400) _logLines.RemoveAt(0);
                _logLines.Add(line.TrimEnd());
                if (_logExpanded) SyncLogText();
            });
        }

        public void MarkSuccess(string title, string detail) {
            InvokeUi(delegate {
                _isRunning = false;
                _isError = false;
                _isSuccess = true;
                _targetProgress = 100f;
                _creepCap = 100f;
                _displayProgress = 100f;
                if (!string.IsNullOrEmpty(title)) _stageTitle = title;
                if (detail != null) _stageDetail = detail;
                _retryBtn.Visible = false;
                _copyLogBtn.Visible = false;
                _closeBtn.Visible = false;
                Invalidate();
            });
        }

        public void MarkError(string title, string detail) {
            InvokeUi(delegate {
                _isRunning = false;
                _isSuccess = false;
                _isError = true;
                _creepCap = _displayProgress;
                if (!string.IsNullOrEmpty(title)) _stageTitle = title;
                if (detail != null) _stageDetail = detail;
                if (!_splashOnly) {
                    _retryBtn.Visible = true;
                    _copyLogBtn.Visible = true;
                    _closeBtn.Visible = true;
                    if (!_logExpanded) SetLogExpanded(true);
                    else SyncLogText();
                }
                Invalidate();
            });
        }

        public void BeginFadeOutAndClose() {
            InvokeUi(delegate { _fadingOut = true; });
        }

        private void OnAnimationTick(object sender, EventArgs e) {
            _phase += 0.055f;
            if (!_fadingOut && Opacity < 1.0) Opacity = Math.Min(1.0, Opacity + 0.14);
            else if (_fadingOut) {
                Opacity = Math.Max(0.0, Opacity - 0.14);
                if (Opacity <= 0.02) {
                    _animTimer.Stop();
                    Close();
                    return;
                }
            }

            if (!_splashOnly && _isRunning) {
                if (_targetProgress < _creepCap) _targetProgress = Math.Min(_creepCap, _targetProgress + 0.045f);
                _displayProgress += (_targetProgress - _displayProgress) * 0.14f;
                if (_displayProgress > 99.6f && _isSuccess) _displayProgress = 100f;
            }
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e) {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            int w = ClientSize.Width, h = ClientSize.Height;

            using (SolidBrush bg = new SolidBrush(BackColor)) g.FillRectangle(bg, 0, 0, w, h);
            using (Pen border = new Pen(Color.FromArgb(46, 51, 60), 1f)) g.DrawRectangle(border, 0, 0, w - 1, h - 1);

            DrawCloseButton(g);
            float cx = w * 0.5f;
            DrawOrb(g, cx, _splashOnly ? 92f : 114f);
            DrawTitleAndBadge(g, cx, _splashOnly ? 162f : 186f);
            DrawStageLabels(g, _splashOnly ? 196f : 222f);
            if (!_splashOnly) DrawProgressBar(g, 60f, 290f, w - 120f, 8f);
        }

        private void DrawCloseButton(Graphics g) {
            if (_closeHovered) {
                using (GraphicsPath p = CreateRoundRect(_closeHitRect, 7f))
                using (SolidBrush b = new SolidBrush(Color.FromArgb(40, 255, 255, 255))) g.FillPath(b, p);
            }
            Color col = _closeHovered ? Color.FromArgb(240, 236, 230) : Color.FromArgb(135, 144, 158);
            using (Pen p = new Pen(col, 1.6f) { StartCap = LineCap.Round, EndCap = LineCap.Round }) {
                int x1 = _closeHitRect.Left + 9, y1 = _closeHitRect.Top + 9;
                int x2 = _closeHitRect.Right - 9, y2 = _closeHitRect.Bottom - 9;
                g.DrawLine(p, x1, y1, x2, y2);
                g.DrawLine(p, x2, y1, x1, y2);
            }
        }

        private void DrawOrb(Graphics g, float cx, float cy) {
            Color accent = _isError ? Color.FromArgb(217, 107, 107)
                : (_isSuccess ? Color.FromArgb(107, 196, 146) : Color.FromArgb(212, 138, 108));
            Color teal = _isError ? Color.FromArgb(160, 74, 82) : Color.FromArgb(95, 168, 156);

            float pulse = 0.93f + 0.07f * (float)Math.Sin(_phase * 1.4f);
            float haloR = 82f * pulse;
            using (GraphicsPath haloPath = new GraphicsPath()) {
                haloPath.AddEllipse(cx - haloR, cy - haloR, haloR * 2f, haloR * 2f);
                using (PathGradientBrush pgb = new PathGradientBrush(haloPath)) {
                    pgb.CenterPoint = new PointF(cx, cy);
                    pgb.CenterColor = Color.FromArgb(_isRunning ? 74 : 88, accent);
                    pgb.SurroundColors = new[] { Color.FromArgb(0, teal) };
                    g.FillPath(pgb, haloPath);
                }
            }

            float ringR = 52f;
            using (Pen ringBg = new Pen(Color.FromArgb(38, 43, 51), 3f)) {
                g.DrawEllipse(ringBg, cx - ringR, cy - ringR, ringR * 2f, ringR * 2f);
            }
            if (_isRunning) {
                float sweepAngle = (_phase * 95f) % 360f;
                using (Pen orbitPen = new Pen(Color.FromArgb(120, teal), 2.5f) { StartCap = LineCap.Round, EndCap = LineCap.Round }) {
                    g.DrawArc(orbitPen, cx - ringR, cy - ringR, ringR * 2f, ringR * 2f, sweepAngle, 78f);
                }
            }
            float arcSweep = _splashOnly ? 360f : Math.Max(0f, Math.Min(360f, _displayProgress * 3.6f));
            if (!_splashOnly && arcSweep > 0.5f) {
                using (Pen progPen = new Pen(accent, 3.2f) { StartCap = LineCap.Round, EndCap = LineCap.Round }) {
                    g.DrawArc(progPen, cx - ringR, cy - ringR, ringR * 2f, ringR * 2f, -90f, arcSweep);
                }
            }

            float coreR = 39f * (0.98f + 0.02f * (float)Math.Sin(_phase * 1.4f));
            using (GraphicsPath corePath = new GraphicsPath()) {
                corePath.AddEllipse(cx - coreR, cy - coreR, coreR * 2f, coreR * 2f);
                using (PathGradientBrush coreBrush = new PathGradientBrush(corePath)) {
                    coreBrush.CenterPoint = new PointF(cx - coreR * 0.28f, cy - coreR * 0.3f);
                    coreBrush.CenterColor = Color.FromArgb(245, 224, 206);
                    coreBrush.SurroundColors = new[] { accent };
                    g.FillPath(coreBrush, corePath);
                }
                using (Pen rim = new Pen(Color.FromArgb(95, 255, 245, 236), 1.2f)) {
                    g.DrawEllipse(rim, cx - coreR, cy - coreR, coreR * 2f, coreR * 2f);
                }
            }
        }

        private void DrawTitleAndBadge(Graphics g, float cx, float y) {
            const string title = "AllY · Джинни";
            const string badge = "v0.1.1";
            using (Font tf = new Font("Segoe UI", 19f, FontStyle.Bold, GraphicsUnit.Pixel))
            using (Font bf = new Font("Consolas", 11.5f, FontStyle.Bold, GraphicsUnit.Pixel)) {
                SizeF ts = g.MeasureString(title, tf);
                float badgeW = Math.Max(44f, g.MeasureString(badge, bf).Width + 12f);
                float left = cx - (ts.Width + 8f + badgeW) * 0.5f;
                using (SolidBrush tb = new SolidBrush(Color.FromArgb(240, 236, 228))) g.DrawString(title, tf, tb, left, y);
                RectangleF pill = new RectangleF(left + ts.Width + 6f, y + 3f, badgeW, 20f);
                using (GraphicsPath pp = CreateRoundRect(pill, 9f))
                using (SolidBrush pb = new SolidBrush(Color.FromArgb(34, 212, 138, 108)))
                using (Pen pen = new Pen(Color.FromArgb(95, 212, 138, 108), 1f)) {
                    g.FillPath(pb, pp);
                    g.DrawPath(pen, pp);
                }
                using (SolidBrush bb = new SolidBrush(Color.FromArgb(228, 168, 124)))
                using (StringFormat sf = CenterFormat()) g.DrawString(badge, bf, bb, pill, sf);
            }
        }

        private void DrawStageLabels(Graphics g, float y) {
            RectangleF hr = new RectangleF(32f, y, ClientSize.Width - 64f, 26f);
            RectangleF dr = new RectangleF(32f, y + 27f, ClientSize.Width - 64f, 24f);
            Color hCol = _isError ? Color.FromArgb(240, 150, 150) : Color.FromArgb(232, 228, 220);
            using (Font hf = new Font("Segoe UI", 15f, FontStyle.Bold, GraphicsUnit.Pixel))
            using (Font df = new Font("Segoe UI", 12.5f, FontStyle.Regular, GraphicsUnit.Pixel))
            using (SolidBrush hb = new SolidBrush(hCol))
            using (SolidBrush db = new SolidBrush(Color.FromArgb(148, 157, 170)))
            using (StringFormat sf = CenterFormat()) {
                sf.Trimming = StringTrimming.EllipsisCharacter;
                sf.FormatFlags = StringFormatFlags.NoWrap;
                g.DrawString(_stageTitle ?? string.Empty, hf, hb, hr, sf);
                g.DrawString(_stageDetail ?? string.Empty, df, db, dr, sf);
            }
        }

        private void DrawProgressBar(Graphics g, float x, float y, float width, float height) {
            Color pctColor = _isError ? Color.FromArgb(230, 128, 128) : (_isSuccess ? Color.FromArgb(136, 218, 170) : Color.FromArgb(201, 133, 105));
            string pctText = string.Format("{0}%", (int)Math.Round(_displayProgress));
            using (Font pf = new Font("Consolas", 11.5f, FontStyle.Bold, GraphicsUnit.Pixel))
            using (SolidBrush pbr = new SolidBrush(pctColor))
            using (StringFormat prf = new StringFormat { Alignment = StringAlignment.Far, LineAlignment = StringAlignment.Far }) {
                g.DrawString(pctText, pf, pbr, new RectangleF(x, y - 20f, width, 16f), prf);
            }
            RectangleF track = new RectangleF(x, y, width, height);
            using (GraphicsPath trackPath = CreateRoundRect(track, height * 0.5f)) {
                using (SolidBrush tb = new SolidBrush(Color.FromArgb(31, 35, 42))) g.FillPath(tb, trackPath);
                using (Pen te = new Pen(Color.FromArgb(52, 58, 68), 1f)) g.DrawPath(te, trackPath);

                float fillW = width * Math.Max(0f, Math.Min(1f, _displayProgress / 100f));
                if (fillW <= 1f) return;

                GraphicsState saved = g.Save();
                g.SetClip(trackPath);
                Color c1 = _isError ? Color.FromArgb(196, 82, 82) : (_isSuccess ? Color.FromArgb(88, 182, 130) : Color.FromArgb(198, 114, 86));
                Color c2 = _isError ? Color.FromArgb(230, 128, 128) : (_isSuccess ? Color.FromArgb(136, 218, 170) : Color.FromArgb(232, 176, 130));
                using (LinearGradientBrush fb = new LinearGradientBrush(track, c1, c2, 0f)) g.FillRectangle(fb, new RectangleF(x, y, fillW, height));

                if (_isRunning) {
                    float sx = x - 60f + ((_phase * 58f) % (width + 120f));
                    RectangleF sr = new RectangleF(sx, y, 60f, height);
                    using (LinearGradientBrush sb = new LinearGradientBrush(sr, Color.FromArgb(0, 255, 255, 255), Color.FromArgb(75, 255, 255, 255), 0f)) {
                        sb.SetBlendTriangularShape(0.5f);
                        g.FillRectangle(sb, sr);
                    }
                }
                g.Restore(saved);
            }
        }

        private Button MakeActionButton(string label, bool primary) {
            Button btn = new Button {
                Text = label,
                Visible = false,
                FlatStyle = FlatStyle.Flat,
                Size = new Size(88, 28),
                Cursor = Cursors.Hand,
                Font = new Font("Segoe UI", 12f, primary ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Pixel),
                BackColor = primary ? Color.FromArgb(196, 116, 86) : Color.FromArgb(27, 30, 36),
                ForeColor = primary ? Color.FromArgb(18, 14, 12) : Color.FromArgb(228, 224, 218)
            };
            btn.FlatAppearance.BorderSize = 1;
            btn.FlatAppearance.BorderColor = primary ? Color.FromArgb(218, 142, 112) : Color.FromArgb(62, 69, 80);
            btn.FlatAppearance.MouseOverBackColor = primary ? Color.FromArgb(214, 136, 106) : Color.FromArgb(40, 45, 54);
            return btn;
        }

        private void OnToggleLogClicked(object sender, EventArgs e) { SetLogExpanded(!_logExpanded); }

        private void SetLogExpanded(bool expanded) {
            _logExpanded = expanded;
            _logToggle.Text = expanded ? "▾ Скрыть подробности" : "▸ Подробности";
            _logPanel.Visible = expanded;
            ClientSize = new Size(540, expanded ? 520 : 368);
            if (expanded) SyncLogText();
            Invalidate();
        }

        private void SyncLogText() {
            var sb = new StringBuilder();
            for (int i = 0; i < _logLines.Count; i++) {
                if (i > 0) sb.Append(Environment.NewLine);
                sb.Append(_logLines[i]);
            }
            _logBox.Text = sb.ToString();
            _logBox.SelectionStart = _logBox.TextLength;
            _logBox.ScrollToCaret();
        }

        private void OnCopyLogClicked(object sender, EventArgs e) {
            try {
                Clipboard.SetText(string.Join(Environment.NewLine, _logLines.ToArray()));
                _copyLogBtn.Text = "Скопировано ✓";
                Timer t = new Timer { Interval = 1500 };
                t.Tick += delegate { t.Stop(); t.Dispose(); if (!IsDisposed) _copyLogBtn.Text = "Копировать лог"; };
                t.Start();
            } catch { }
        }

        private void HandleCloseClick() {
            if (!_splashOnly && _isRunning) {
                DialogResult ans = MessageBox.Show(
                    "Установка AllY ещё не завершена. Прервать сборку?",
                    "AllY · Джинни",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question
                );
                if (ans != DialogResult.Yes) return;
                if (CancelRequested != null) CancelRequested(this, EventArgs.Empty);
                return;
            }
            Close();
        }

        private void InvokeUi(Action action) {
            if (IsDisposed) return;
            try {
                if (InvokeRequired) BeginInvoke(action);
                else action();
            } catch { }
        }

        private static GraphicsPath CreateRoundRect(RectangleF r, float radius) {
            GraphicsPath path = new GraphicsPath();
            float rad = Math.Max(0.5f, Math.Min(radius, Math.Min(r.Width, r.Height) * 0.5f));
            float d = rad * 2f;
            path.AddArc(r.X, r.Y, d, d, 180f, 90f);
            path.AddArc(r.Right - d, r.Y, d, d, 270f, 90f);
            path.AddArc(r.Right - d, r.Bottom - d, d, d, 0f, 90f);
            path.AddArc(r.X, r.Bottom - d, d, d, 90f, 90f);
            path.CloseFigure();
            return path;
        }

        private static StringFormat CenterFormat() {
            return new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        }
    }
}
