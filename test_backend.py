#!/usr/bin/env python3
"""
后端测试脚本
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

import httpx
import time
import subprocess
import signal

def start_server():
    """启动后端服务器"""
    print("Starting backend server...")
    proc = subprocess.Popen(
        ['python', '-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', '8000'],
        cwd='backend',
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    # 等待服务器启动
    time.sleep(3)
    return proc

def test_health():
    """测试健康检查接口"""
    try:
        resp = httpx.get('http://localhost:8000/health', timeout=5)
        print(f"Health check: {resp.status_code} - {resp.json()}")
        return resp.status_code == 200
    except Exception as e:
        print(f"Health check failed: {e}")
        return False

def test_get_papers():
    """测试获取论文列表"""
    try:
        resp = httpx.get('http://localhost:8000/papers', timeout=5)
        print(f"Get papers: {resp.status_code} - {resp.json()}")
        return resp.status_code == 200
    except Exception as e:
        print(f"Get papers failed: {e}")
        return False

def test_upload_pdf():
    """测试上传PDF文件"""
    # 创建一个简单的测试PDF文件
    test_pdf_path = '/tmp/test.pdf'
    
    # 创建一个最小的有效PDF文件
    pdf_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids []\n/Count 0\n>>\nendobj\nxref\n0 3\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\ntrailer\n<<\n/Size 3\n/Root 1 0 R\n>>\nstartxref\n105\n%%EOF"
    
    with open(test_pdf_path, 'wb') as f:
        f.write(pdf_content)
    
    try:
        with open(test_pdf_path, 'rb') as f:
            files = {'file': ('test.pdf', f, 'application/pdf')}
            data = {'title': 'Test Paper', 'auto_extract': 'false'}
            resp = httpx.post('http://localhost:8000/papers', files=files, data=data, timeout=10)
            print(f"Upload PDF: {resp.status_code}")
            if resp.status_code != 201:
                print(f"Response: {resp.text}")
            return resp.status_code == 201
    except Exception as e:
        print(f"Upload PDF failed: {e}")
        return False
    finally:
        if os.path.exists(test_pdf_path):
            os.remove(test_pdf_path)

def test_url_paper():
    """测试通过URL添加论文"""
    try:
        data = {
            'url': 'https://arxiv.org/pdf/2301.00001.pdf',
            'title': 'Test URL Paper'
        }
        resp = httpx.post('http://localhost:8000/papers/url', json=data, timeout=30)
        print(f"URL paper: {resp.status_code}")
        if resp.status_code != 201:
            print(f"Response: {resp.text[:200]}")
        return resp.status_code == 201
    except Exception as e:
        print(f"URL paper failed: {e}")
        return False

def main():
    print("=" * 50)
    print("Backend Test Suite")
    print("=" * 50)
    
    # 先检查服务器是否已经在运行
    try:
        httpx.get('http://localhost:8000/health', timeout=2)
        print("Using existing server on port 8000")
        server_proc = None
    except:
        print("Starting new server...")
        server_proc = start_server()
    
    try:
        # 运行测试
        tests = [
            ("Health Check", test_health),
            ("Get Papers", test_get_papers),
            ("Upload PDF", test_upload_pdf),
            ("URL Paper", test_url_paper),
        ]
        
        results = []
        for name, test_func in tests:
            print(f"\n--- Testing: {name} ---")
            result = test_func()
            results.append((name, result))
        
        # 打印结果
        print("\n" + "=" * 50)
        print("Test Results:")
        print("=" * 50)
        for name, result in results:
            status = "✓ PASS" if result else "✗ FAIL"
            print(f"{status}: {name}")
        
        all_passed = all(r for _, r in results)
        print("\n" + ("All tests passed!" if all_passed else "Some tests failed!"))
        
    finally:
        if server_proc:
            print("\nStopping server...")
            server_proc.send_signal(signal.SIGTERM)
            server_proc.wait()

if __name__ == '__main__':
    main()
