import instaloader
import sys

def generate_cookies(username, password):
    L = instaloader.Instaloader()
    try:
        L.login(username, password)
    except Exception as e:
        print(f"Login failed: {e}")
        return False
    
    with open('ig_cookies.txt', 'w') as f:
        f.write("# Netscape HTTP Cookie File\n# http://curl.haxx.se/rfc/cookie_spec.html\n# This is a generated file!  Do not edit.\n\n")
        for cookie in L.context._session.cookies:
            domain = cookie.domain
            if not domain.startswith('.'):
                domain = '.' + domain
            flag = "TRUE" if domain.startswith('.') else "FALSE"
            secure = "TRUE" if cookie.secure else "FALSE"
            expiration = str(int(cookie.expires)) if cookie.expires else "0"
            f.write(f"{domain}\t{flag}\t{cookie.path}\t{secure}\t{expiration}\t{cookie.name}\t{cookie.value}\n")
    print("Successfully generated ig_cookies.txt")
    return True

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python login_ig.py <user> <pass>")
        sys.exit(1)
    generate_cookies(sys.argv[1], sys.argv[2])
