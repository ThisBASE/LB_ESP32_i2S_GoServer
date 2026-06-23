@echo off
:: Kiểm tra quyền Administrator
>nul 2>&1 "%SYSTEMROOT%\\system32\\cacls.exe" "%SYSTEMROOT%\\system32\\config\\system"
if '%errorlevel%' NEQ '0' (
    echo [ERROR] Vui long click chuot phai va chon "Run as Administrator"!
    pause
    exit /b
)

title Cau hinh IP Tinh tu File Config - Windows 11
color 0A
cls

echo =======================================================
echo    CHUONG TRINH DOC FILE CONFIG VAO CAU HINH IP TINH
echo =======================================================
echo.

:: 1. Kiem tra va in ra duong dan file config.txt
if not exist "config.txt" (
    echo [ERROR] Khong tim thay file "config.txt"!
    echo Dang tu dong tao file...
    (
    echo IP_Address=192.168.0.100
    echo Subnet_Mask=255.255.255.0
    echo Gateway=192.168.0.1
    echo DNS1=8.8.8.8
    echo DNS2=8.8.4.4
    ) > config.txt
    
    echo -------------------------------------------------------
    echo [+] Da tao xong file tai duong dan:
    echo     "%~dp0config.txt"
    echo -------------------------------------------------------
    echo Dang mo file config.txt de ban kiem tra...
    start notepad.exe "config.txt"
    pause
    exit /b
) else (
    echo -------------------------------------------------------
    echo [+] Tim thay file cau hinh tai duong dan:
    echo     "%~dp0config.txt"
    echo -------------------------------------------------------
)

:: 2. Đọc file config.txt để lấy thông số cấu hình
echo [+] Dang tai thong so tu file config.txt...
for /f "delims=" %%x in (config.txt) do (
    set "%%x"
)

:: Kiểm tra tính hợp lệ sơ bộ của biến sau khi đọc
if "%IP_Address%"=="" (
    echo [ERROR] File config.txt thieu thong so IP_Address!
    pause
    exit /b
)

:: 3. Tự động tìm card mạng đang kết nối Internet
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
echo -------------------------------------------------------
echo [THONG TIN CAU HINH SE AP DUNG]:
echo    - IP Address:  %IP_Address%
echo    - Subnet Mask: %Subnet_Mask%
echo    - Gateway:     %Gateway%
echo    - Primary DNS: %DNS1%
echo    - Backup DNS:  %DNS2%
echo -------------------------------------------------------
echo.

:: 4. Thực hiện cấu hình IP và DNS tĩnh
echo [+] Dang thiet lap IP Tinh...
netsh interface ip set address name="%adapterName%" static %IP_Address% %Subnet_Mask% %Gateway% 1 >nul

echo [+] Dang thiet lap he thong DNS...
netsh interface ip set dns name="%adapterName%" static %DNS1% validate=no >nul
netsh interface ip add dns name="%adapterName%" %DNS2% index=2 validate=no >nul

:: 5. Làm sạch bộ nhớ đệm mạng để nhận cấu hình chuẩn nhất
echo [+] Dang lam sach vung nho dem DNS (FlushDNS)...
ipconfig /flushdns >nul

echo.
echo =======================================================
echo [SUCCESS] DA CHUYEN SANG IP TINH HOAN TAT!
echo =======================================================
echo.
pause

    f.write(bat_v2_content)

with open("config.txt", "w", encoding="utf-8") as f:
    f.write(config_content)