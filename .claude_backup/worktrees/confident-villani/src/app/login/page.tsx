import Image from "next/image"
import LoginForm from "@/components/auth/login-form"

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex bg-white">
      {/* Left Side - Form (Takes full width on mobile, half on desktop) */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 md:p-12 lg:p-24 relative z-10 bg-white shadow-[20px_0_40px_rgba(0,0,0,0.02)]">
        
        {/* Mobile Illustration (hidden on desktop, visible on mobile) */}
        <div className="lg:hidden mb-8 w-full flex justify-center mt-4">
            <div className="relative w-full max-w-[280px]">
              <Image 
                src="/1.png" 
                alt="DISMA Fresh" 
                width={500} 
                height={500} 
                className="w-full h-auto object-contain mix-blend-multiply" 
                priority
              />
            </div>
        </div>

        {/* Form Container */}
        <div className="w-full max-w-sm xl:max-w-md space-y-8">
          <div className="text-left space-y-2 mb-10">
            <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-slate-900">
              Welcome Back!!
            </h1>
            <p className="text-slate-500 font-medium text-sm pt-2">
              Please enter your secure PIN to access your workspace.
            </p>
          </div>
          
          <LoginForm />
        </div>
      </div>

      {/* Right Side - Illustration (Hidden on mobile, visible on desktop) */}
      <div className="hidden lg:flex w-1/2 relative flex-col items-center justify-center p-12 overflow-hidden bg-white">
        
        {/* 3D Illustration */}
        <div className="relative z-10 w-full max-w-2xl animate-in fade-in slide-in-from-bottom-12 duration-1000 transform hover:scale-105 transition-transform ease-out">
          {/* Note: Removed drop-shadows on the image because they render around the square bounds of the PNG, destroying the mix-blend-multiply effect. */}
          <Image 
            src="/1.png" 
            alt="Delivery Illustration" 
            width={1000} 
            height={1000} 
            className="w-full h-auto object-contain mix-blend-multiply"
            style={{ mixBlendMode: 'multiply' }}
            priority
          />
        </div>
      </div>
    </div>
  )
}
