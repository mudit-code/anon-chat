import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, Line, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { User, Activity, Target, Utensils, AlertCircle, Leaf, ChevronRight, ChevronLeft, Download, RefreshCw, Sparkles, TrendingUp } from 'lucide-react';

const NutriMate = () => {
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [meals, setMeals] = useState([]);
  const [userData, setUserData] = useState({
    name: '',
    age: '',
    gender: '',
    height: '',
    weight: '',
    goal: '',
    activityLevel: '',
    dietType: '',
    allergies: '',
    cuisine: ''
  });

  const totalSteps = 7;

  const updateUserData = (field, value) => {
    setUserData(prev => ({ ...prev, [field]: value }));
  };

  const calculateBMR = () => {
    const { weight, height, age, gender } = userData;
    let bmr;
    if (gender === 'male') {
      bmr = 10 * weight + 6.25 * height - 5 * age + 5;
    } else {
      bmr = 10 * weight + 6.25 * height - 5 * age - 161;
    }
    
    const activityMultipliers = {
      sedentary: 1.2,
      moderate: 1.55,
      active: 1.725,
      veryActive: 1.9
    };
    
    let tdee = bmr * activityMultipliers[userData.activityLevel];
    
    if (userData.goal === 'loss') tdee -= 500;
    if (userData.goal === 'gain') tdee += 500;
    
    return Math.round(tdee);
  };

  const generateMeals = () => {
    const totalCalories = calculateBMR();
    const breakfast = Math.round(totalCalories * 0.25);
    const lunch = Math.round(totalCalories * 0.35);
    const dinner = Math.round(totalCalories * 0.30);
    const snack1 = Math.round(totalCalories * 0.05);
    const snack2 = Math.round(totalCalories * 0.05);

    const mealDatabase = {
      vegetarian: {
        breakfast: [
          { name: 'Oats with Banana & Almonds', image: '🥣', protein: 12, carbs: 55, fat: 8 },
          { name: 'Poha with Peanuts', image: '🍚', protein: 8, carbs: 45, fat: 10 },
          { name: 'Idli with Sambar', image: '🫓', protein: 10, carbs: 50, fat: 5 }
        ],
        lunch: [
          { name: 'Brown Rice, Dal & Salad', image: '🍛', protein: 18, carbs: 75, fat: 8 },
          { name: 'Quinoa Bowl with Chickpeas', image: '🥗', protein: 20, carbs: 65, fat: 12 },
          { name: 'Veg Pulao with Raita', image: '🍲', protein: 15, carbs: 70, fat: 10 }
        ],
        dinner: [
          { name: 'Grilled Paneer with Veggies', image: '🧈', protein: 25, carbs: 30, fat: 15 },
          { name: 'Vegetable Stir Fry', image: '🥘', protein: 12, carbs: 40, fat: 10 },
          { name: 'Palak Paneer with Roti', image: '🫔', protein: 22, carbs: 35, fat: 14 }
        ],
        snacks: [
          { name: 'Apple with Peanut Butter', image: '🍎', protein: 4, carbs: 20, fat: 8 },
          { name: 'Greek Yogurt', image: '🥛', protein: 10, carbs: 12, fat: 5 },
          { name: 'Trail Mix', image: '🥜', protein: 6, carbs: 15, fat: 12 }
        ]
      },
      nonVegetarian: {
        breakfast: [
          { name: 'Scrambled Eggs with Toast', image: '🍳', protein: 18, carbs: 35, fat: 12 },
          { name: 'Chicken Sausage & Oats', image: '🌭', protein: 20, carbs: 40, fat: 10 },
          { name: 'Egg White Omelette', image: '🍳', protein: 15, carbs: 30, fat: 8 }
        ],
        lunch: [
          { name: 'Grilled Chicken with Rice', image: '🍗', protein: 35, carbs: 60, fat: 10 },
          { name: 'Fish Curry with Brown Rice', image: '🐟', protein: 30, carbs: 65, fat: 12 },
          { name: 'Chicken Salad Bowl', image: '🥗', protein: 32, carbs: 45, fat: 15 }
        ],
        dinner: [
          { name: 'Grilled Salmon with Veggies', image: '🐟', protein: 35, carbs: 25, fat: 18 },
          { name: 'Chicken Breast & Broccoli', image: '🥦', protein: 40, carbs: 20, fat: 10 },
          { name: 'Turkey Meatballs', image: '🍖', protein: 32, carbs: 30, fat: 14 }
        ],
        snacks: [
          { name: 'Boiled Eggs', image: '🥚', protein: 12, carbs: 2, fat: 10 },
          { name: 'Chicken Strips', image: '🍗', protein: 15, carbs: 5, fat: 8 },
          { name: 'Tuna Salad', image: '🥫', protein: 20, carbs: 3, fat: 5 }
        ]
      }
    };

    const dietKey = userData.dietType === 'vegan' || userData.dietType === 'vegetarian' ? 'vegetarian' : 'nonVegetarian';
    const meals = mealDatabase[dietKey];

    return [
      { ...meals.breakfast[Math.floor(Math.random() * meals.breakfast.length)], type: 'Breakfast', calories: breakfast },
      { ...meals.lunch[Math.floor(Math.random() * meals.lunch.length)], type: 'Lunch', calories: lunch },
      { ...meals.snacks[Math.floor(Math.random() * meals.snacks.length)], type: 'Snack', calories: snack1 },
      { ...meals.dinner[Math.floor(Math.random() * meals.dinner.length)], type: 'Dinner', calories: dinner },
      { ...meals.snacks[Math.floor(Math.random() * meals.snacks.length)], type: 'Evening Snack', calories: snack2 }
    ];
  };

  const handleSubmit = () => {
    setIsLoading(true);
    setTimeout(() => {
      const generatedMeals = generateMeals();
      setMeals(generatedMeals);
      setIsLoading(false);
      setShowResults(true);
    }, 2000);
  };

  const regenerateMeal = (index) => {
    const newMeals = [...meals];
    const mealType = meals[index].type;
    const generatedMeals = generateMeals();
    const replacement = generatedMeals.find(m => m.type === mealType);
    newMeals[index] = replacement;
    setMeals(newMeals);
  };

  const nextStep = () => {
    if (step < totalSteps - 1) setStep(step + 1);
    else handleSubmit();
  };

  const prevStep = () => {
    if (step > 0) setStep(step - 1);
  };

  const FormStep = ({ children, title, icon: Icon }) => (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-md mx-auto"
    >
      <div className="bg-white rounded-2xl shadow-lg p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-emerald-100 rounded-full">
            <Icon className="w-6 h-6 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
        </div>
        {children}
      </div>
    </motion.div>
  );

  const InputField = ({ label, type = "text", value, onChange, placeholder, options }) => (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      {options ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
        >
          <option value="">Select {label}</option>
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
        />
      )}
    </div>
  );

  const MealCard = ({ meal, index }) => {
    const macroData = [
      { name: 'Protein', value: meal.protein, color: '#10b981' },
      { name: 'Carbs', value: meal.carbs, color: '#3b82f6' },
      { name: 'Fat', value: meal.fat, color: '#f59e0b' }
    ];

    return (
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1 }}
        className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-shadow duration-300"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-4xl">{meal.image}</span>
              <div>
                <p className="text-xs font-medium text-emerald-600">{meal.type}</p>
                <h3 className="text-lg font-bold text-gray-800">{meal.name}</h3>
              </div>
            </div>
            <button
              onClick={() => regenerateMeal(index)}
              className="p-2 hover:bg-gray-100 rounded-full transition"
            >
              <RefreshCw className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          
          <div className="bg-emerald-50 rounded-lg p-3 mb-4">
            <p className="text-2xl font-bold text-emerald-700">{meal.calories} kcal</p>
          </div>

          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={macroData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#10b981" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 flex items-center justify-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-20 h-20 mx-auto mb-6"
          >
            <Sparkles className="w-20 h-20 text-emerald-500" />
          </motion.div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Crafting Your Perfect Meal Plan</h2>
          <p className="text-gray-600">Analyzing your preferences...</p>
        </motion.div>
      </div>
    );
  }

  if (showResults) {
    const totalCalories = calculateBMR();
    const totalProtein = meals.reduce((sum, m) => sum + m.protein, 0);
    const totalCarbs = meals.reduce((sum, m) => sum + m.carbs, 0);
    const totalFat = meals.reduce((sum, m) => sum + m.fat, 0);

    const macroDistribution = [
      { name: 'Protein', value: totalProtein, color: '#10b981' },
      { name: 'Carbs', value: totalCarbs, color: '#3b82f6' },
      { name: 'Fat', value: totalFat, color: '#f59e0b' }
    ];

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 p-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <h1 className="text-4xl font-bold text-gray-800 mb-2">Your Personalized Meal Plan</h1>
            <p className="text-gray-600">Tailored for {userData.name}</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white"
            >
              <TrendingUp className="w-10 h-10 mb-3 opacity-80" />
              <p className="text-sm opacity-90 mb-1">Daily Target</p>
              <p className="text-3xl font-bold">{totalCalories} kcal</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-xl p-6 shadow-lg"
            >
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={macroDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {macroDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <p className="text-center text-sm text-gray-600 mt-2">Macro Distribution</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white"
            >
              <Sparkles className="w-10 h-10 mb-3 opacity-80" />
              <p className="text-sm opacity-90 mb-2">AI Tip of the Day</p>
              <p className="text-sm">Drink 8-10 glasses of water daily for optimal metabolism and nutrient absorption.</p>
            </motion.div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {meals.map((meal, index) => (
              <MealCard key={index} meal={meal} index={index} />
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex gap-4 justify-center"
          >
            <button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-medium transition">
              <Download className="w-5 h-5" />
              Download Plan
            </button>
            <button
              onClick={() => {
                setShowResults(false);
                setStep(0);
              }}
              className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition"
            >
              Start Over
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 p-6">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-5xl font-bold text-gray-800 mb-2">NutriMate</h1>
          <p className="text-gray-600">Your AI-Powered Nutrition Companion</p>
        </motion.div>

        <div className="mb-8">
          <div className="bg-white rounded-full h-3 overflow-hidden shadow-inner">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${((step + 1) / totalSteps) * 100}%` }}
              transition={{ duration: 0.5 }}
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600"
            />
          </div>
          <p className="text-center text-sm text-gray-600 mt-2">
            Step {step + 1} of {totalSteps}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <FormStep title="Basic Information" icon={User}>
              <InputField
                label="Name"
                value={userData.name}
                onChange={(v) => updateUserData('name', v)}
                placeholder="Enter your name"
              />
              <InputField
                label="Age"
                type="number"
                value={userData.age}
                onChange={(v) => updateUserData('age', v)}
                placeholder="Enter your age"
              />
              <InputField
                label="Gender"
                value={userData.gender}
                onChange={(v) => updateUserData('gender', v)}
                options={[
                  { value: 'male', label: 'Male' },
                  { value: 'female', label: 'Female' },
                  { value: 'other', label: 'Other' }
                ]}
              />
            </FormStep>
          )}

          {step === 1 && (
            <FormStep title="Physical Information" icon={Activity}>
              <InputField
                label="Height (cm)"
                type="number"
                value={userData.height}
                onChange={(v) => updateUserData('height', v)}
                placeholder="Enter your height"
              />
              <InputField
                label="Weight (kg)"
                type="number"
                value={userData.weight}
                onChange={(v) => updateUserData('weight', v)}
                placeholder="Enter your weight"
              />
            </FormStep>
          )}

          {step === 2 && (
            <FormStep title="Your Goal" icon={Target}>
              <InputField
                label="What's your goal?"
                value={userData.goal}
                onChange={(v) => updateUserData('goal', v)}
                options={[
                  { value: 'loss', label: 'Weight Loss' },
                  { value: 'maintenance', label: 'Weight Maintenance' },
                  { value: 'gain', label: 'Weight Gain' }
                ]}
              />
            </FormStep>
          )}

          {step === 3 && (
            <FormStep title="Activity Level" icon={Activity}>
              <InputField
                label="How active are you?"
                value={userData.activityLevel}
                onChange={(v) => updateUserData('activityLevel', v)}
                options={[
                  { value: 'sedentary', label: 'Sedentary (Little to no exercise)' },
                  { value: 'moderate', label: 'Moderate (Exercise 3-5 days/week)' },
                  { value: 'active', label: 'Active (Exercise 6-7 days/week)' },
                  { value: 'veryActive', label: 'Very Active (Intense exercise daily)' }
                ]}
              />
            </FormStep>
          )}

          {step === 4 && (
            <FormStep title="Diet Type" icon={Leaf}>
              <InputField
                label="Dietary Preference"
                value={userData.dietType}
                onChange={(v) => updateUserData('dietType', v)}
                options={[
                  { value: 'vegetarian', label: 'Vegetarian' },
                  { value: 'vegan', label: 'Vegan' },
                  { value: 'nonVegetarian', label: 'Non-Vegetarian' },
                  { value: 'keto', label: 'Keto' },
                  { value: 'paleo', label: 'Paleo' }
                ]}
              />
            </FormStep>
          )}

          {step === 5 && (
            <FormStep title="Allergies & Restrictions" icon={AlertCircle}>
              <InputField
                label="Allergies or Food Restrictions (Optional)"
                value={userData.allergies}
                onChange={(v) => updateUserData('allergies', v)}
                placeholder="e.g., Nuts, Dairy, Gluten"
              />
            </FormStep>
          )}

          {step === 6 && (
            <FormStep title="Cuisine Preference" icon={Utensils}>
              <InputField
                label="Preferred Cuisine"
                value={userData.cuisine}
                onChange={(v) => updateUserData('cuisine', v)}
                options={[
                  { value: 'indian', label: 'Indian' },
                  { value: 'mediterranean', label: 'Mediterranean' },
                  { value: 'continental', label: 'Continental' },
                  { value: 'asian', label: 'Asian' },
                  { value: 'mixed', label: 'Mixed' }
                ]}
              />
            </FormStep>
          )}
        </AnimatePresence>

        <div className="flex gap-4 mt-8 max-w-md mx-auto">
          {step > 0 && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={prevStep}
              className="flex-1 flex items-center justify-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium transition"
            >
              <ChevronLeft className="w-5 h-5" />
              Back
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={nextStep}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-medium transition"
          >
            {step === totalSteps - 1 ? 'Generate Plan' : 'Next'}
            <ChevronRight className="w-5 h-5" />
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default NutriMate;