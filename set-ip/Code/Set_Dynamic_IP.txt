@echo off
:: Kiểm tra quyền Administrator
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo [ERROR] Vui long click chuot phai va chon "Run as Administrator"!
    pause
    exit /b
)

title Chuyen sang IP Dong (DHCP) - Windows 11
color 0B
cls

echo =======================================================
echo    CHUONG TRINH CHUYEN SANG IP DONG (DHCP) TU DONG
echo =======================================================
echo.

:: 1. Tự động tìm card mạng đang kết nối Internet
set "adapterName="
for /f "tokens=2 delims==" %%A in ('wmic path Win32_NetworkAdapter where "NetConnectionStatus=2" get NetConnectionID /value 2^>nul') do (
    set "adapterName=%%A"
)

if "%adapterName%"=="" (
    echo [ERROR] Khong tim thay card mang nao dang hoat dong!
    pause
    exit /b
)

echo [+] Da phat hien Card mang: "%adapterName%"
echo.

:: 2. Chuyển cấu hình sang IP và DNS tự động (DHCP)
echo [+] Dang xoa IP Tinh va chuyen sang nhan IP dong tu Router...
netsh interface ip set address name="%adapterName%" source=dhcp >nul

echo [+] Dang chuyen cau hinh DNS sang tu dong...
netsh interface ip set dns name="%adapterName%" source=dhcp >nul

:: 3. Làm mới địa chỉ mạng để nhận IP mới ngay lập tức
echo [+] Dang xoa cache va lam moi dia chi IP (Release / Renew)...
ipconfig /flushdns >nul
ipconfig /release "%adapterName%" >nul
ipconfig /renew "%adapterName%" >nul

echo.
echo =======================================================
echo [SUCCESS] DA CHUYEN SANG IP DONG (DHCP) THANH CONG!
echo =======================================================
echo Thong tin IP dong moi nhan tu Router:
echo -------------------------------------------------------
ipconfig | findstr /i "IPv4 Address Default Gateway Subnet Mask"
echo -------------------------------------------------------
echo.
pause